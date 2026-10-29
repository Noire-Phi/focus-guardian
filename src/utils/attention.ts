// Decides whether you're focused, from one camera frame at a time, and when being
// distracted has gone on long enough to alert. Plain functions with no React or MediaPipe
// imports, so the rules can be unit tested. See docs/ATTENTION.md for the full picture.

/** Tuning knobs. Angles are in degrees, scores go from 0 to 1. */
export const ATTENTION = {
  // Head turned further than this to the side of every target = turned sideways
  sidewaysDeg: 30,
  // How close the head must point to a target (screen or book) to count as looking at it
  targetYawDeg: 20,
  targetPitchDeg: 20,
  // Eyes alone looking far to the side, or (in Screen mode) far down
  maxEyeSideScore: 0.65,
  maxEyeDownScore: 0.8,
  // Phone (all modes): how sure the object detector must be, how many checks in a row
  // confirm it, and how many checks in a row without it clear it again
  phoneScore: 0.5,
  phoneConfirmChecks: 3,
  phoneClearChecks: 2,
  // Book (shown in Book mode): how sure, and how long a sighting counts
  bookScore: 0.4,
  objectHoldMs: 2000,
  // Being distracted must last this long before an alert…
  alertAfterMs: 5000,
  // …and you must be back on task for this long to clear it, so a flicker doesn't reset it
  recoverAfterMs: 1000,
  // How often to check a frame for your face, and for objects. Object checks ride on the
  // first face check at least 500 ms after the last one, so in practice every 600 ms, and
  // 3 checks in a row take about 1.2 s.
  checkEveryMs: 200,
  objectCheckEveryMs: 500,
} as const

export type StudyMode = 'screen' | 'book' | 'mixed'

/** Head direction: yaw is turning left/right, pitch is tilting up/down. Signed degrees. */
export interface Pose {
  yawDeg: number
  pitchDeg: number
}

/** Where your head points when looking at the screen and at your book or paper. */
export interface Calibration {
  screen: Pose
  book: Pose | null
}

/** Used before calibrating: a camera centred above the screen, so the screen is straight ahead. */
export const DEFAULT_SCREEN: Pose = { yawDeg: 0, pitchDeg: 0 }

export type Gaze = 'looking' | 'away' | 'no-face'

/** Why a frame was judged the way it was; the UI and docs explain each one. */
export type Reason =
  | 'on-screen'
  | 'on-book'
  | 'between' // Mixed mode: moving between the screen and the book
  | 'sideways'
  | 'off-target'
  | 'eyes-away'
  | 'no-face'
  | 'phone'

export interface Reading {
  gaze: Gaze
  reason: Reason
  pose: Pose | null
}

/** Blendshape scores by name, e.g. { eyeLookOutLeft: 0.12, ... } */
export type Blendshapes = Record<string, number>

export interface Face {
  matrix: number[] | null
  blendshapes: Blendshapes
}

/**
 * Head yaw and pitch from Face Landmarker's 4×4 facial transformation matrix (read as
 * column-major, MediaPipe's layout). Which direction counts as positive doesn't matter:
 * calibration records your own screen and book angles, and readings are compared to those.
 */
export function headPose(matrix: number[]): Pose {
  const r20 = matrix[2]
  const r21 = matrix[6]
  const r22 = matrix[10]
  const toDeg = 180 / Math.PI
  return {
    yawDeg: Math.asin(Math.max(-1, Math.min(1, -r20))) * toDeg,
    pitchDeg: Math.atan2(r21, r22) * toDeg,
  }
}

function eyeScores(b: Blendshapes): { side: number; down: number } {
  const get = (name: string) => b[name] ?? 0
  // Both eyes look the same way: left eye "out" goes with right eye "in", and vice versa
  const lookingLeft = (get('eyeLookOutLeft') + get('eyeLookInRight')) / 2
  const lookingRight = (get('eyeLookInLeft') + get('eyeLookOutRight')) / 2
  const down = (get('eyeLookDownLeft') + get('eyeLookDownRight')) / 2
  return { side: Math.max(lookingLeft, lookingRight), down }
}

function isNear(pose: Pose, target: Pose): boolean {
  return (
    Math.abs(pose.yawDeg - target.yawDeg) <= ATTENTION.targetYawDeg &&
    Math.abs(pose.pitchDeg - target.pitchDeg) <= ATTENTION.targetPitchDeg
  )
}

/** Between the screen and the book: within reach of either sideways, and between them vertically. */
function isBetween(pose: Pose, screen: Pose, book: Pose): boolean {
  const low = Math.min(screen.pitchDeg, book.pitchDeg)
  const high = Math.max(screen.pitchDeg, book.pitchDeg)
  const yawOk =
    Math.abs(pose.yawDeg - screen.yawDeg) <= ATTENTION.targetYawDeg ||
    Math.abs(pose.yawDeg - book.yawDeg) <= ATTENTION.targetYawDeg
  return yawOk && pose.pitchDeg >= low && pose.pitchDeg <= high
}

/** The study modes that need a calibrated book position before they can run. */
export function needsBookCalibration(mode: StudyMode, calibration: Calibration | null): boolean {
  return mode !== 'screen' && !calibration?.book
}

export interface ReadContext {
  mode: StudyMode
  calibration: Calibration | null
  /** A phone has been confirmed (seen in several object checks in a row) */
  phoneConfirmed: boolean
}

const looking = (reason: Reason, pose: Pose | null): Reading => ({ gaze: 'looking', reason, pose })
const away = (reason: Reason, pose: Pose | null): Reading => ({ gaze: 'away', reason, pose })

/**
 * One frame: focused or distracted, and why. Rules, in order:
 * 1. No face: distracted (you left, or turned fully away).
 * 2. A confirmed phone: distracted, whatever your head does (any mode).
 * 3. Head turned sideways, away from every target: distracted.
 * 4. Eyes looking far to the side: distracted.
 * 5. Head pointing at a target for this mode (screen, book, or in Mixed either one or
 *    in between): focused. In Screen mode, eyes looking far down count as distracted.
 * 6. Anything else (e.g. looking up, or at the screen in Book mode): distracted.
 */
export function readFace(face: Face | null, ctx: ReadContext): Reading {
  if (!face) return { gaze: 'no-face', reason: 'no-face', pose: null }
  if (ctx.phoneConfirmed) {
    return away('phone', face.matrix ? headPose(face.matrix) : null)
  }

  const eyes = eyeScores(face.blendshapes)
  if (!face.matrix) {
    // No head pose this frame: go by the eyes alone
    return eyes.side > ATTENTION.maxEyeSideScore
      ? away('eyes-away', null)
      : looking(ctx.mode === 'book' ? 'on-book' : 'on-screen', null)
  }

  const pose = headPose(face.matrix)
  const screen = ctx.calibration?.screen ?? DEFAULT_SCREEN
  const book = ctx.calibration?.book ?? null
  const targets =
    ctx.mode === 'screen' || !book ? [screen] : ctx.mode === 'book' ? [book] : [screen, book]

  const sideways = targets.every((t) => Math.abs(pose.yawDeg - t.yawDeg) > ATTENTION.sidewaysDeg)
  if (sideways) return away('sideways', pose)
  if (eyes.side > ATTENTION.maxEyeSideScore) return away('eyes-away', pose)

  if (ctx.mode === 'screen' || !book) {
    if (!isNear(pose, screen)) return away('off-target', pose)
    // Head at the screen but eyes far down: likely a phone or desk below the screen
    return eyes.down > ATTENTION.maxEyeDownScore
      ? away('off-target', pose)
      : looking('on-screen', pose)
  }
  if (ctx.mode === 'book') {
    return isNear(pose, book) ? looking('on-book', pose) : away('off-target', pose)
  }
  // Mixed
  if (isNear(pose, screen)) return looking('on-screen', pose)
  if (isNear(pose, book)) return looking('on-book', pose)
  if (isBetween(pose, screen, book)) return looking('between', pose)
  return away('off-target', pose)
}

/** Best object scores in one frame from the object detector, 0 when not seen. */
export interface ObjectScores {
  book: number
  phone: number
}

/**
 * Phone confirmation. One detection could be a mistake (a dark book cover, a remote), so a
 * phone only counts once it's been seen with enough confidence in several object checks
 * in a row. Once confirmed, it takes a couple of checks in a row without it to clear, so
 * a single missed detection doesn't make the alert flicker.
 */
export interface PhoneTracker {
  streak: number // object checks in a row with a phone
  misses: number // object checks in a row without one
  confirmed: boolean
}

export const NO_PHONE: PhoneTracker = { streak: 0, misses: 0, confirmed: false }

export function updatePhone(tracker: PhoneTracker, phoneScore: number): PhoneTracker {
  if (phoneScore >= ATTENTION.phoneScore) {
    const streak = tracker.streak + 1
    return {
      streak,
      misses: 0,
      confirmed: tracker.confirmed || streak >= ATTENTION.phoneConfirmChecks,
    }
  }
  const misses = tracker.misses + 1
  return {
    streak: 0,
    misses,
    confirmed: tracker.confirmed && misses < ATTENTION.phoneClearChecks,
  }
}

/** When a book was last seen, so one missed detection doesn't drop it. */
export function updateBookSeenAt(bookAt: number | null, objects: ObjectScores, now: number) {
  return objects.book >= ATTENTION.bookScore ? now : bookAt
}

export function seenRecently(at: number | null, now: number): boolean {
  return at !== null && now - at <= ATTENTION.objectHoldMs
}

export interface AttentionState {
  awaySince: number | null // when the current stretch of being distracted began
  backSince: number | null // when you got back on task, while that's still being confirmed
  alerting: boolean
}

export const ATTENTIVE: AttentionState = { awaySince: null, backSince: null, alerting: false }

/**
 * Feeds one reading into the 5 second rule. Getting back on task must last
 * `recoverAfterMs` to end a stretch, so a brief glance back, or one misread frame,
 * doesn't restart the count.
 */
export function updateAttention(
  state: AttentionState,
  gaze: Gaze,
  now: number,
  rules: { alertAfterMs: number; recoverAfterMs: number } = ATTENTION,
): AttentionState {
  if (gaze !== 'looking') {
    const awaySince = state.awaySince ?? now
    // Once alerting, stay alerting for the rest of the stretch (one alert per stretch)
    const alerting = state.alerting || now - awaySince >= rules.alertAfterMs
    return { awaySince, backSince: null, alerting }
  }

  if (state.awaySince === null) return state
  const backSince = state.backSince ?? now
  if (now - backSince >= rules.recoverAfterMs) return ATTENTIVE
  // Still confirming you're back: keep the stretch (and any alert) going
  return { ...state, backSince }
}

/** How long the current stretch of being distracted has lasted (0 when focused). */
export function awayForMs(state: AttentionState, now: number): number {
  return state.awaySince === null ? 0 : Math.max(0, now - state.awaySince)
}
