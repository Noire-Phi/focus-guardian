# Performance

What the camera checks cost, how that was measured, and the rules that keep it low.

## How to measure

In development (`npm run dev`), every detection is timed. In the browser console:

```js
focusGuardianPerfReset() // start a fresh measurement
// …use the app for a while…
focusGuardianPerf() // runs, median / mean / max ms, and % of the main thread per model
```

`check` is one whole camera check (face plus whatever else ran with it). `busyPercent` is the
share of wall-clock time spent detecting. In a production build this code is removed.

## Measurements (30 October 2026)

Setup: dev build in Chromium on this Windows laptop. A 640×480, 30 fps canvas stream showing
MediaPipe's sample portrait stood in for the webcam, so a face was found on every check. The
real camera could not be used in the test browser. Each run was 20 seconds.

### Main-thread time while checking

| Checks on            | Face (median) | Phone (median) | Posture (median) | Main thread busy | Longest check |
| -------------------- | ------------- | -------------- | ---------------- | ---------------- | ------------- |
| Face + phone, before | 12.4 ms       | 27.2 ms        | –                | 9.9 %            | 49 ms         |
| All three, before    | 12.2 ms       | 27.3 ms        | 11.1 ms          | 11.1 %           | **54.7 ms**   |
| All three, after     | 13.0 ms       | 26.8 ms        | 10.8 ms          | 11.5 %           | **46.8 ms**   |

About 4.4 face checks a second, a phone check and a posture check about every 0.7 s each.

- **Total cost stays about 11 %** of one core's main thread with everything on. That's the
  price of the three models at these rates; the change doesn't do less work.
- **No check is long enough to make the page stutter now.** Before, the phone and posture
  checks fell due together, so every ~0.7 s one check ran all three models (≈ 51–55 ms, over
  the 50 ms "long task" line where scrolling and typing can hitch). Now they take turns on
  alternate checks, and the worst check is face + phone (≤ 47 ms).

### Hidden tab

| 10 s with the tab hidden      | Before | After |
| ----------------------------- | ------ | ----- |
| Detections run                | 0      | 0     |
| Loop wake-ups                 | 50     | 0     |
| "Hidden" frames sent to React | 50     | 1     |

Before, detection was already skipped while hidden, but the loop still woke every 200 ms
(about once a second in a real background tab, once browsers throttle timers) to say so. Now
it stops, sends one "hidden" frame so the checks reset, and starts again when you come back.
It was checking again within 200 ms of returning: 22 checks in the next 5 s.

### Camera on, no focus session

0 checks in 5 s. Detection only runs during a focus session (or while calibrating).

### What loads, and when

Nothing from MediaPipe loads with the app. Checked from the network log at startup, and in
the production build, where the library is its own chunk.

| File                         | Size (uncompressed)   | Loaded when                                    |
| ---------------------------- | --------------------- | ---------------------------------------------- |
| `vision_bundle` (JS library) | 154 KB (46 KB gzip)   | The first focus session with the camera on     |
| `vision_wasm_internal.wasm`  | 13.8 MB (3.1 MB sent) | Same                                           |
| `face_landmarker.task`       | 3.6 MB                | Same                                           |
| `efficientdet_lite0.tflite`  | 6.9 MB                | Only if the phone check is on                  |
| `pose_landmarker_lite.task`  | 5.5 MB                | Only if the posture check is on and calibrated |

Each model is loaded once and shared; after that the browser's cache serves them. Each
MediaPipe task starts its own copy of the WASM runtime (it's fetched once, then from cache).

### A slow computer (simulated)

Each face check was made slower on purpose (a busy wait added to it), on the same stand-in
camera. "Delay to the page" is how late a 50 ms timer fired: how long typing or clicking would
wait at worst.

| Face check     | Checks a second | Main thread busy | Camera time counted  | Worst delay to the page |
| -------------- | --------------- | ---------------- | -------------------- | ----------------------- |
| 13 ms (normal) | 4.2             | 11.8 %           | 10.4 s of 11.3 s ¹   | 64 ms                   |
| 135 ms         | 1.4             | 24.3 %           | 16.1 s of 16.5 s ¹   | 179 ms                  |
| 416 ms, before | 0.78            | **35.6 %**       | **14.0 s of 16.6 s** | 457 ms                  |
| 416 ms, after  | 0.57            | 25.7 %           | 23.6 s of 23 s ¹     | 449 ms                  |

¹ Camera time is passed on once a second, so a window starts or ends with up to a second in
flight.

Before, the wait between checks was capped at 800 ms, so a very slow computer went over the
25 % ceiling, and the focus score counted at most 1 s per check, so 16 % of the time was
dropped. Both limits were raised (2 s wait, 2.5 s per check). They were low to keep a hidden
tab's gap from counting; now the checks stop and reset while hidden, so that can't happen.

Two things the ceiling can't fix, because MediaPipe runs on the page's main thread:

- **Each slow check still blocks the page for its full length** (about 0.4 s on the slowest
  run). Only moving detection to a Web Worker would avoid that.
- **Starting the models blocks the page once**, for about a second here (longer on a slow
  computer), the first time a session runs with the camera on.

## The rules in code

- **One check at a time, 200 ms apart, scheduled after the previous one ends**
  (`useFaceTracker`), so slow checks can't pile up. Frames the camera hasn't updated are
  skipped.
- **At most one slow model per check** (`pickExtraCheck` in `utils/detectionSchedule.ts`):
  phone or posture, whichever has waited longer.
- **A ceiling on CPU for slow computers** (`nextCheckDelay`): if a check takes longer than
  50 ms (for example when the GPU isn't available and MediaPipe runs on the CPU), the next one
  waits three times as long, so checking uses at most 25 % of the main thread. The wait is
  capped at 2 s, and one face check may count for up to 2.5 s in the focus score, so focus
  time is still counted fully for checks of up to about 600 ms.
- **Nothing runs while the tab is hidden** (`usePageVisible`).
- **A smaller camera stream**: 640×480 at 15 fps requested (`useWebcam`). The checks only use 5
  frames a second and the models shrink each frame to 256 px or less, so a bigger or faster
  stream is only extra work for the camera and browser. These are "ideal" values, so any
  camera still works.

## Not measured

- **The real webcam.** The stand-in stream can't show what the smaller camera stream saves.
  To check it: Task Manager → the browser's GPU and renderer processes, with the camera on,
  before and after.
- **Whole-process CPU and battery.** The numbers above are main-thread time inside the page;
  the browser also spends time decoding video and on the GPU.
- **A real slow machine.** Slow computers were simulated (see below), not run.
- **Memory.** Loaded models stay in memory until the page is closed, so the next session
  starts instantly. With all three that's tens of MB of WASM memory.
