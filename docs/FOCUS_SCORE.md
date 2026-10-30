# Focus score

Each focus session gets a **focus score from 0 to 100%**, worked out from what the camera
saw. The Today panel shows today's score and the last session's.

Code: `utils/focusScore.ts` (the formula, a pure function) and `utils/focusScore.test.ts`.

## What's measured during a session

While the camera's focus check runs, every check stands for the time since the previous
one (normally 200 ms for the face, about 600 ms for posture; capped at 2.5 s and 5 s, which
leaves room for a slow computer's longer gaps but never counts a stall as one long reading). That time is added up into:

| Measured           | Meaning                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `checkedMs`        | Time the focus check was watching you                                                                     |
| `focusedMs`        | …of which you were **on task**: looking at the screen, the book, or between them, as your study mode says |
| `phoneMs`          | …of which a **phone was confirmed** (3 detections in a row)                                               |
| `postureCheckedMs` | Time posture was checked **and** your shoulders were visible                                              |
| `goodPostureMs`    | …of which your posture was good                                                                           |

The session also records `awayMs`: time spent in another tab (from the tab guard).

These are saved with the session, so the score can always be worked out again.

## The formula

Three parts, each from 0 to 1:

```
attention = focusedMs ÷ (checkedMs + awayMs)
phone     = max(0, 1 − 3 × phoneMs ÷ checkedMs)
posture   = goodPostureMs ÷ postureCheckedMs
```

Then a weighted sum:

```
score = 100 × (0.60 × attention + 0.25 × phone + 0.15 × posture)
```

rounded to a whole number.

### Why each part looks like this

- **Attention (60%)** is the biggest part: being on task is what focus means. Time in
  another tab is added to the bottom of the fraction, because the camera check pauses
  while the tab is hidden, but you clearly weren't on task.
- **Phone (25%)** gets its own part, on top of attention. Phone time already counts as
  "not on task" in attention, so the phone counts twice, on purpose: picking up your
  phone is the distraction this app most wants to discourage. Each 1% of the session on
  your phone takes 3% off this part, so 10% of the time on your phone leaves 0.7, and a
  third of the session or more leaves 0.
- **Posture (15%)** matters less to focus than the other two, so it weighs least.

### Missing data

- **No posture data** (posture not calibrated, or your shoulders never visible): posture's
  15% is shared out between the other two in proportion, so the score is
  `100 × (0.60 × attention + 0.25 × phone) ÷ 0.85`. A session isn't marked down for a
  check that didn't run.
- **Less than 1 minute of camera time** (or the camera was off): **no score**. Too little
  to say anything; the Today panel shows "—".

## Worked examples

| Session                                                                                  | attention | phone | posture | score |
| ---------------------------------------------------------------------------------------- | --------- | ----- | ------- | ----- |
| Perfect                                                                                  | 1         | 1     | 1       | 100%  |
| On task half the time, no phone, good posture half the time                              | 0.5       | 1     | 0.5     | 63%   |
| Same, but posture not calibrated                                                         | 0.5       | 1     | —       | 65%   |
| 25 min watched, 24 min on task, 2.5 min on phone, 5 min in another tab, posture good 90% | 0.8       | 0.7   | 0.9     | 79%   |

The last row, step by step:

- attention = 24 ÷ (25 + 5) = **0.8**
- phone = 1 − 3 × (2.5 ÷ 25) = 1 − 0.3 = **0.7**
- posture = **0.9**
- score = 100 × (0.6 × 0.8 + 0.25 × 0.7 + 0.15 × 0.9) = 100 × (0.48 + 0.175 + 0.135) = **79%**

(Each of these examples is also a unit test.)

## Today's score

Today's score is the average of today's scored sessions, **weighted by camera time**, so
a 50 minute session counts more than a 5 minute one:

```
today = Σ (score × checkedMs) ÷ Σ checkedMs
```

## Tuning

All in `SCORE` in `utils/focusScore.ts`:

| Setting           | Value | Meaning                                  |
| ----------------- | ----- | ---------------------------------------- |
| `attentionWeight` | 0.60  | Weight of time on task                   |
| `phoneWeight`     | 0.25  | Weight of the phone part                 |
| `postureWeight`   | 0.15  | Weight of good posture                   |
| `phonePenalty`    | 3     | How much each 1% of phone time takes off |
| `minCheckedMs`    | 60 s  | Least camera time that gets a score      |

## Limitations

- The score is only as good as the detection behind it (see `docs/ATTENTION.md`): the
  angle limits and thresholds haven't been tuned on real faces yet.
- Paused time isn't watched, so it neither helps nor hurts.
- Up to about a second of camera time at the very end of a session may not be counted,
  because camera time is saved in one-second batches.
