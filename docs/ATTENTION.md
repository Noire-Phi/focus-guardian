# How the focus check works

Focus Guardian uses your webcam to tell whether you're focused on your study material,
and alerts you after 5 seconds of being distracted. Everything runs in your browser:
video frames never leave your computer.

## The pipeline

```
 Webcam frame ──► Face Landmarker ──► head pose + eye gaze ─┐
   (5 per second)                                           ├─► rules for the ──► 5 second ──► alert
 Webcam frame ──► Object Detector ──► book? phone? ─────────┘    study mode        rule        (banner + chime)
   (1 per second, Book mode only)                                    ▲
                                                Calibration ─────────┘
                                         (your screen + book positions)
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

| Mode             | Focused when                                                      | Distracted when                                                                     |
| ---------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Screen**       | Head points at the screen position                                | Turned sideways, looking down or up, eyes far down or to the side                   |
| **Book / Paper** | Head points at the book position (looking down)                   | Turned sideways, looking up at the screen, eyes to the side, **a phone is in view** |
| **Mixed**        | Head points at the screen, the book, **or anywhere between them** | Turned sideways, looking up past the screen, eyes to the side                       |

Looking **down** is treated as focused in Book and Mixed modes (reading or writing).
Turning **sideways** is distracted in every mode.

Screen mode works without calibrating (it assumes the screen is straight ahead).
Book and Mixed modes need the book position first.

## 4. The rules for one frame

Each frame is checked in this order. The first rule that matches decides.

1. **No face found** → distracted (you left, or turned fully away)
2. **Book mode and a phone was seen in the last 2 s** → distracted, whatever your head does
3. **Head turned more than 30° sideways from every target** → distracted (_turned sideways_)
4. **Both eyes looking far to the side** (score above 0.65) → distracted
5. **Head within 20° of a target for this mode** → focused
   - In Screen mode, eyes looking far down (above 0.8) still count as distracted:
     the head faces the screen but the eyes are on something below it
6. **Anything else** → distracted (e.g. looking at the screen while in Book mode)

"Within 20° of a target" means both the yaw and the pitch are within 20° of the
calibrated angles. Mixed mode adds a band: between the screen and book heights,
and within 20° sideways of either.

## 5. Book mode: books vs phones

In Book mode a second model runs: MediaPipe **Object Detector** (EfficientDet-Lite0,
trained on the COCO dataset, which includes `book` and `cell phone`). It's restricted to
those two categories so nothing else is reported.

- **Phone** (confidence ≥ 0.5): you're distracted, even while looking down. A phone
  in your lap and a book in your lap look the same to head pose, so this is how they're
  told apart.
- **Book** (confidence ≥ 0.4): shown as "Reading · book in view". It doesn't change the
  decision: writing on paper is focused too, and paper isn't a COCO category.

A sighting counts for 2 seconds, so one missed detection doesn't drop it.

## 6. The 5 second rule (avoiding false alarms)

Single frames are noisy, and real study involves quick glances. So one distracted frame
never alerts on its own:

- A **stretch of distraction** starts at the first distracted frame.
- The alert fires only when the stretch has lasted **5 seconds**.
- To end a stretch, you must be back on task for **1 full second**. A quick glance back,
  or one misread frame, doesn't restart the count. (Without this, a flickering reading
  could keep resetting the timer and never alert.)
- The alert fires **once** per stretch: a banner pinned to the top of the window, plus a
  chime if sound is on. It clears after a second back on task.
- While the tab is hidden, checking pauses and starts fresh when you return (the tab
  guard already counts time in other tabs).

## 7. Keeping the browser fast

- **5 face checks per second**, not the camera's 30. Plenty for a 5 second rule.
- **Objects once per second**, and only in Book mode. The object model isn't even
  downloaded otherwise.
- **Checks never pile up**: each is scheduled after the previous finishes, and a check
  is skipped if the camera hasn't produced a new frame.
- **Loaded on demand**: MediaPipe's code is a separate file fetched the first time the
  check starts; the two models are downloaded from Google's CDN when first needed.
- **GPU first, CPU fallback**, one face only.
- **Warm-up**: each model's first detection is slow (setup), so it runs during
  "Loading", not in the middle of a session.

Measured in testing: loading caused one pause of about 0.3 s; during checking, no task
blocked the page for more than 0.15 s.

## 8. Limitations (worth mentioning when presenting)

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
- **Phones look like books sometimes**, and vice versa; the 0.5 confidence threshold and
  2 second hold reduce, but don't remove, mistakes.

## Tuning knobs

All in `ATTENTION` (`utils/attention.ts`) and `CALIBRATION` (`utils/calibration.ts`):

| Setting                              | Value       | Meaning                                       |
| ------------------------------------ | ----------- | --------------------------------------------- |
| `sidewaysDeg`                        | 30°         | Sideways turn that counts as distracted       |
| `targetYawDeg`, `targetPitchDeg`     | 20°         | How close to a target counts as looking at it |
| `maxEyeSideScore`                    | 0.65        | Eyes far to the side                          |
| `maxEyeDownScore`                    | 0.8         | Eyes far down (Screen mode)                   |
| `phoneScore`, `bookScore`            | 0.5, 0.4    | Object detector confidence                    |
| `objectHoldMs`                       | 2 s         | How long a sighting counts                    |
| `alertAfterMs`                       | 5 s         | Distraction before an alert                   |
| `recoverAfterMs`                     | 1 s         | Back on task needed to clear it               |
| `checkEveryMs`, `objectCheckEveryMs` | 200 ms, 1 s | How often frames are checked                  |
| `settleMs`, `sampleMs`               | 1.5 s, 2 s  | Calibration: get ready, then record           |
| `minGapDeg`                          | 10°         | Minimum screen-to-book distance               |
