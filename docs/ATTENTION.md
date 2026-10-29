# How the focus check works

(How sessions are scored from all this: see [FOCUS_SCORE.md](FOCUS_SCORE.md).)

Focus Guardian uses your webcam to tell whether you're focused on your study material.
It alerts you after 5 seconds of being distracted, or as soon as a phone is confirmed.
Everything runs in your browser: video frames never leave your computer.

## The pipeline

```
 Webcam frame ──► Face Landmarker ──► head pose + eye gaze ───────────┐
   (5 per second)                                                     ├─► rules for the ──► 5 second ──► alert
 Webcam frame ──► Object Detector ──► phone? book? ──► phone confirmed ┘    study mode        rule      (banner + chime)
   (about every 600 ms, all modes)                    (3 checks in a row)      ▲                ▲
                                                Calibration ───────────────────┘                │
                                         (your screen + book positions)     confirmed phone ────┘ (alerts at once)
```

Code: `hooks/useFaceTracker.ts` runs the models, `utils/attention.ts` holds the rules,
`utils/calibration.ts` the calibration, and `hooks/useAttention.ts` ties them together.

## 1. Head pose: where is your head pointing?

MediaPipe **Face Landmarker** finds 478 points on your face and also returns a
**facial transformation matrix**: a 4×4 matrix describing how your head is rotated.
From its rotation part we read two angles:

- **Yaw**: turning your head left or right
- **Pitch**: tilting it up or down

```
yaw   = asin(−R₂₀)
pitch = atan2(R₂₁, R₂₂)
```

It also returns **blendshapes**: scores from 0 to 1 for facial movements, including
where each eye looks (`eyeLookOutLeft`, `eyeLookDownRight`, …). These catch "head still,
eyes on the phone".

## 2. Calibration: where are _your_ screen and book?

Fixed angles don't work for everyone: the camera may sit above or beside the screen,
and people put their books in different places. So the app records **your** positions:

1. **Screen**: look at the middle of the screen and keep still.
2. **Book or paper**: put it where you normally read, look down at it, keep still.

Each step waits 1.5 s for you to get into position, then records your head angles for
2 s (about 10 frames). The saved position is the **median** of those frames, so a blink
or twitch doesn't pull it off. Calibration fails with a clear message if your face
wasn't seen in at least 5 frames, or if the book position is less than 10° from the
screen position (too close to tell apart).

A nice side effect: since every reading is compared with _your_ recorded angles, it
doesn't matter which direction the maths calls positive, or exactly where the camera is.

## 3. Study modes

| Mode             | Focused when                                                      | Distracted when                                                   |
| ---------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Screen**       | Head points at the screen position                                | Turned sideways, looking down or up, eyes far down or to the side |
| **Book / Paper** | Head points at the book position (looking down)                   | Turned sideways, looking up at the screen, eyes to the side       |
| **Mixed**        | Head points at the screen, the book, **or anywhere between them** | Turned sideways, looking up past the screen, eyes to the side     |

Looking **down** is treated as focused in Book and Mixed modes (reading or writing).
Turning **sideways**, and **a confirmed phone**, are distracted in every mode.

Screen mode works without calibrating (it assumes the screen is straight ahead).
Book and Mixed modes need the book position first.

## 4. The rules for one frame

Each frame is checked in this order. The first rule that matches decides.

1. **No face found** → distracted (you left, or turned fully away)
2. **A confirmed phone** (see section 5) → distracted, whatever your head does
3. **Head turned more than 30° sideways from every target** → distracted (_turned sideways_)
4. **Both eyes looking far to the side** (score above 0.65) → distracted
5. **Head within 20° of a target for this mode** → focused
   - In Screen mode, eyes looking far down (above 0.8) still count as distracted:
     the head faces the screen but the eyes are on something below it
6. **Anything else** → distracted (e.g. looking at the screen while in Book mode)

"Within 20° of a target" means both the yaw and the pitch are within 20° of the
calibrated angles. Mixed mode adds a band: between the screen and book heights,
and within 20° sideways of either.

## 5. Phone detection

While the focus check runs, in every mode, a second model looks at the camera:
MediaPipe **Object Detector** (EfficientDet-Lite0, trained on the COCO dataset, which
includes `cell phone` and `book`). It's restricted to those two categories, so nothing
else is reported, and it runs on the first face check at least 500 ms after the last
one (in practice every 600 ms).

A phone in your lap and a book in your lap look the same to head pose, so this is how
they're told apart. But a single detection can be wrong (a dark book cover, a remote,
a reflection), so a phone has to pass two guards before it counts:

1. **Confidence threshold:** the detector must be at least **50%** sure it's a phone.
   Weaker detections are ignored.
2. **Several checks in a row:** it must be detected in **3 object checks in a row**
   (about 1.2 s). A check without the phone starts the count over.

Once confirmed:

- The frame counts as distracted ("Phone in view"), whatever your head is doing.
- The alert fires **straight away**, with its own message: "Phone detected. Put your
  phone away to stay focused." It doesn't also wait for the 5 seconds: the 3-in-a-row
  rule is already the false-alarm guard.
- It takes **2 checks in a row without the phone** to clear, so one missed detection
  doesn't make the alert flicker. After that, the normal rule applies: 1 second back on
  task clears the alert.

```
check:      1     2     3     4     5     6     7
phone?      ✓     ✓     ✗     ✓     ✓     ✓     ✗ ✗
streak:     1     2     0     1     2     3 → confirmed, alert   → cleared after 2 misses
```

**Books** (confidence ≥ 40%) are only used in Book mode, to show "Reading · book in
view". A book doesn't change the decision: writing on paper is focused too, and paper
isn't a COCO category. A book sighting counts for 2 seconds.

## 6. The 5 second rule (avoiding false alarms)

Single frames are noisy, and real study involves quick glances. So one distracted frame
never alerts on its own:

- A **stretch of distraction** starts at the first distracted frame.
- The alert fires only when the stretch has lasted **5 seconds**.
- To end a stretch, you must be back on task for **1 full second**. A quick glance back,
  or one misread frame, doesn't restart the count. (Without this, a flickering reading
  could keep resetting the timer and never alert.)
- The alert fires **once** per stretch: a banner pinned to the top of the window, plus a
  chime if sound is on. It clears after a second back on task. (A confirmed phone starts
  the alert early; the 5 seconds passing later in the same stretch doesn't chime again.)
- While the tab is hidden, checking pauses and starts fresh when you return (the tab
  guard already counts time in other tabs).

## 7. Keeping the browser fast

- **5 face checks per second**, not the camera's 30. Plenty for a 5 second rule.
- **Objects about every 600 ms**, only while the focus check runs (not while calibrating,
  on a break or with the camera off). The object model isn't downloaded until then.
- **Checks never pile up**: each is scheduled after the previous finishes, and a check
  is skipped if the camera hasn't produced a new frame.
- **Loaded on demand**: MediaPipe's code is a separate file fetched the first time the
  check starts; the two models are downloaded from Google's CDN when first needed.
- **GPU first, CPU fallback**, one face only.
- **Warm-up**: each model's first detection is slow (setup), so it runs during
  "Loading", not in the middle of a session.

Measured in testing: loading caused one pause of about 0.3 s; during checking, no task
blocked the page for more than 0.15 s.

## 8. Posture

A third model, MediaPipe **Pose Landmarker** (the "lite" version), finds 33 points on
your body. Posture only needs three of them: your **nose** and both **shoulders**. It
checks posture at most every 500 ms, during a focus session, once you've calibrated.

**Three measurements**, all relative to your shoulders, so they don't change when you
shift around in the frame:

| Measurement    | What it is                                                    | Catches                                          |
| -------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| Head height    | How far your nose is above your shoulders, in shoulder widths | Slouching: your head sinks toward your shoulders |
| Shoulder width | How wide your shoulders look on camera                        | Leaning in: closer to the camera looks wider     |
| Shoulder tilt  | How much the line between your shoulders slopes               | Leaning to one side                              |

**Calibrating good posture:** sit the way you want to sit, both shoulders in view, and
keep still. After 1.5 s to get ready, it measures for 2 s and saves the **median** of
each measurement. It fails with a clear message if your shoulders weren't visible.

**Comparing** each check with your calibrated posture:

- **Slouching:** head height more than **20% lower**
- **Leaning in:** shoulders more than **20% wider**
- **Leaning to one side:** shoulder line sloping more than **10°** more

If Pose can't clearly see your nose or shoulders (visibility below 50%), that check is
skipped: not counted as good or bad.

**Alerting:** posture drifts slowly, and shifting in your seat for a moment is fine, so
it uses the same stretch rule as the focus check with longer times: bad posture for
**20 seconds** in a row before a gentle "Check your posture" alert, and **3 seconds**
of good posture to clear it. It's separate from the focus alert; both can show at once.

## 9. Limitations (worth mentioning when presenting)

- **Not tuned on real faces yet.** The angle limits (30° sideways, 20° to a target) and
  eye scores are sensible starting points; they're all in the `ATTENTION` object in
  `utils/attention.ts`.
- **Looking far down can lose your face.** If the camera can't see your face while you
  read, that counts as "no face". Calibration catches this: it fails if your face isn't
  visible at the book position.
- **The object detector only sees what the camera sees.** A phone or book below the
  camera's view won't be detected.
- **Head pose isn't true eye tracking.** Eyes are only used for strong signals (far to the
  side, far down), not to find the exact spot you're looking at.
- **Phones look like other things sometimes**, and vice versa. The 50% threshold and the
  3-in-a-row rule reduce false alarms but don't remove them, and a phone held mostly
  out of view, or face down, may never be confirmed.

- **Posture is judged from the front.** A webcam sees head height, shoulder width and
  tilt well, but not how curved your back is. Big slouches show up; small ones may not.

## Settings: switches and sensitivity

In **Settings** you can turn each check on or off and choose a sensitivity. Both are
saved with the other settings.

| Switch          | When off                                                                    |
| --------------- | --------------------------------------------------------------------------- |
| Looking away    | Head pose and eye gaze aren't judged. No focus score (it needs this check). |
| Phone           | The object detector doesn't run (or download).                              |
| Posture         | Pose Landmarker doesn't run (or download).                                  |
| Leaving the tab | Tab leaves and time away aren't counted.                                    |

With looking away off but phone on, the camera only watches for phones.

**Sensitivity** swaps in a set of thresholds (`utils/sensitivity.ts`). Medium is the
defaults described above.

| Setting                      | Low  | Medium | High |
| ---------------------------- | ---- | ------ | ---- |
| Sideways turn                | 40°  | 30°    | 22°  |
| Within a target              | 25°  | 20°    | 15°  |
| Alert after distracted for   | 10 s | 5 s    | 3 s  |
| Phone: detector confidence   | 65%  | 50%    | 40%  |
| Phone: checks in a row       | 4    | 3      | 2    |
| Posture: head drop / lean in | 30%  | 20%    | 12%  |
| Posture: shoulder tilt       | 15°  | 10°    | 6°   |
| Posture: alert after         | 40 s | 20 s   | 10 s |

How often frames are checked doesn't change with sensitivity.

## Tuning knobs

Posture settings are in `POSTURE` (`utils/posture.ts`): `maxHeadDrop` 0.2,
`maxLeanIn` 0.2, `maxTiltDeg` 10°, `minVisibility` 0.5, `alertAfterMs` 20 s,
`recoverAfterMs` 3 s, `checkEveryMs` 500 ms, `minSamples` 3.

The rest are in `ATTENTION` (`utils/attention.ts`) and `CALIBRATION` (`utils/calibration.ts`):

| Setting                              | Value          | Meaning                                       |
| ------------------------------------ | -------------- | --------------------------------------------- |
| `sidewaysDeg`                        | 30°            | Sideways turn that counts as distracted       |
| `targetYawDeg`, `targetPitchDeg`     | 20°            | How close to a target counts as looking at it |
| `maxEyeSideScore`                    | 0.65           | Eyes far to the side                          |
| `maxEyeDownScore`                    | 0.8            | Eyes far down (Screen mode)                   |
| `phoneScore`, `bookScore`            | 0.5, 0.4       | Object detector confidence                    |
| `phoneConfirmChecks`                 | 3              | Object checks in a row to confirm a phone     |
| `phoneClearChecks`                   | 2              | Object checks in a row without it to clear    |
| `objectHoldMs`                       | 2 s            | How long a book sighting counts               |
| `alertAfterMs`                       | 5 s            | Distraction before an alert                   |
| `recoverAfterMs`                     | 1 s            | Back on task needed to clear it               |
| `checkEveryMs`, `objectCheckEveryMs` | 200 ms, 500 ms | How often frames are checked                  |
| `settleMs`, `sampleMs`               | 1.5 s, 2 s     | Calibration: get ready, then record           |
| `minGapDeg`                          | 10°            | Minimum screen-to-book distance               |
