// Decides whether you're looking at the screen, from one Face Landmarker result at a time,
// and when looking away has gone on long enough to alert. Plain functions with no React
// or MediaPipe imports, so the rules can be unit tested.

/** Tuning knobs. Angles are in degrees, blendshape scores go from 0 to 1. */
export const ATTENTION = {
  // Head turned left/right or tilted up/down further than this counts as away
  maxYawDeg: 30,
  maxPitchDeg: 25,
  // Eyes alone looking far to the side, or far down (e.g. at a phone in your lap)
  maxEyeSideScore: 0.65,
  maxEyeDownScore: 0.8,
  // Looking away must last this long before an alert…
  alertAfterMs: 5000,
  // …and you must look back for this long to clear it, so a flicker doesn't reset it
  recoverAfterMs: 1000,
  // How often to check a video frame. 5 checks a second is plenty for a 5 second rule.
  checkEveryMs: 200,
} as const

export type Gaze = 'looking' | 'away' | 'no-face'

export interface FaceReading {
  gaze: Gaze
  yawDeg: number | null
  pitchDeg: number | null
}

/** Blendshape scores by name, e.g. { eyeLookOutLeft: 0.12, ... } */
export type Blendshapes = Record<string, number>

/**
 * Head turn (yaw) and tilt (pitch) from Face Landmarker's 4×4 facial transformation
 * matrix. Only the size of each angle is used, which comes out the same whether the
 * matrix is stored row- or column-major.
 */
export function headPose(matrix: number[]): { yawDeg: number; pitchDeg: number } {
  // Rotation part, reading the matrix as column-major (MediaPipe's layout)
  const r20 = matrix[2]
  const r21 = matrix[6]
  const r22 = matrix[10]
  const toDeg = 180 / Math.PI
  const yaw = Math.asin(Math.max(-1, Math.min(1, -r20)))
  const pitch = Math.atan2(r21, r22)
  return { yawDeg: Math.abs(yaw * toDeg), pitchDeg: Math.abs(pitch * toDeg) }
}

function eyeScores(b: Blendshapes): { side: number; down: number } {
  const get = (name: string) => b[name] ?? 0
  // Both eyes look the same way: left eye "out" goes with right eye "in", and vice versa
  const lookingLeft = (get('eyeLookOutLeft') + get('eyeLookInRight')) / 2
  const lookingRight = (get('eyeLookInLeft') + get('eyeLookOutRight')) / 2
  const down = (get('eyeLookDownLeft') + get('eyeLookDownRight')) / 2
  return { side: Math.max(lookingLeft, lookingRight), down }
}

/** One frame: is there a face, and is it pointed at the screen? */
export function readFace(
  face: { matrix: number[] | null; blendshapes: Blendshapes } | null,
): FaceReading {
  if (!face) return { gaze: 'no-face', yawDeg: null, pitchDeg: null }

  const pose = face.matrix ? headPose(face.matrix) : null
  const eyes = eyeScores(face.blendshapes)
  const headAway =
    pose !== null && (pose.yawDeg > ATTENTION.maxYawDeg || pose.pitchDeg > ATTENTION.maxPitchDeg)
  const eyesAway = eyes.side > ATTENTION.maxEyeSideScore || eyes.down > ATTENTION.maxEyeDownScore

  return {
    gaze: headAway || eyesAway ? 'away' : 'looking',
    yawDeg: pose?.yawDeg ?? null,
    pitchDeg: pose?.pitchDeg ?? null,
  }
}

export interface AttentionState {
  awaySince: number | null // when the current stretch of looking away began
  backSince: number | null // when you looked back, while that's still being confirmed
  alerting: boolean
}

export const ATTENTIVE: AttentionState = { awaySince: null, backSince: null, alerting: false }

/**
 * Feeds one reading into the 5 second rule. No face counts as away (you left, or turned
 * fully). Looking back must last `recoverAfterMs` to end a stretch, so a brief glance
 * at the screen, or one misread frame, doesn't restart the count.
 */
export function updateAttention(
  state: AttentionState,
  gaze: Gaze,
  now: number,
  rules: { alertAfterMs: number; recoverAfterMs: number } = ATTENTION,
): AttentionState {
  if (gaze !== 'looking') {
    const awaySince = state.awaySince ?? now
    return { awaySince, backSince: null, alerting: now - awaySince >= rules.alertAfterMs }
  }

  if (state.awaySince === null) return state
  const backSince = state.backSince ?? now
  if (now - backSince >= rules.recoverAfterMs) return ATTENTIVE
  // Still confirming you're back: keep the stretch (and any alert) going
  return { ...state, backSince }
}

/** How long the current stretch of looking away has lasted (0 when you're looking). */
export function awayForMs(state: AttentionState, now: number): number {
  return state.awaySince === null ? 0 : Math.max(0, now - state.awaySince)
}
