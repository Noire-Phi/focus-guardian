// The focus score: one number from 0 to 100% for how focused a session was, from what
// the camera saw. Plain functions; the formula is explained in docs/FOCUS_SCORE.md.

import type { CameraStats, Session } from '../types'

export const SCORE = {
  // How much each part counts (they add up to 1)
  attentionWeight: 0.6,
  phoneWeight: 0.25,
  postureWeight: 0.15,
  // Each 1% of time on your phone takes 3% off the phone part (33% or more = 0)
  phonePenalty: 3,
  // Less camera time than this is too little to score
  minCheckedMs: 60_000,
} as const

export const EMPTY_CAMERA_STATS: CameraStats = {
  checkedMs: 0,
  focusedMs: 0,
  phoneMs: 0,
  postureCheckedMs: 0,
  goodPostureMs: 0,
}

export function addCameraStats(a: CameraStats, b: Partial<CameraStats>): CameraStats {
  return {
    checkedMs: a.checkedMs + (b.checkedMs ?? 0),
    focusedMs: a.focusedMs + (b.focusedMs ?? 0),
    phoneMs: a.phoneMs + (b.phoneMs ?? 0),
    postureCheckedMs: a.postureCheckedMs + (b.postureCheckedMs ?? 0),
    goodPostureMs: a.goodPostureMs + (b.goodPostureMs ?? 0),
  }
}

/**
 * How much time one camera check stands for: the time since the previous check, capped
 * so a gap (a slow frame, a paused check) isn't counted as one long reading.
 */
export function frameSpanMs(previousAt: number | null, at: number, maxMs: number): number {
  if (previousAt === null) return 0
  return Math.min(Math.max(0, at - previousAt), maxMs)
}

export interface FocusScore {
  score: number // 0 to 100, whole number
  // Each part from 0 to 1, before weighting; posture is null when it wasn't checked
  attention: number
  phone: number
  posture: number | null
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * Scores one session. Returns null when there isn't enough camera time to say.
 *
 *   attention = time on task ÷ (camera time + time away from the tab)
 *   phone     = 1 − 3 × (phone time ÷ camera time), at least 0
 *   posture   = good posture time ÷ posture-checked time
 *   score     = 100 × (0.6 × attention + 0.25 × phone + 0.15 × posture)
 *
 * Without posture data, its 15% is shared out between the other two in proportion.
 */
export function focusScore(
  camera: CameraStats | undefined,
  awayFromTabMs: number,
): FocusScore | null {
  if (!camera || camera.checkedMs < SCORE.minCheckedMs) return null

  // Time in another tab counts as not on task: the camera check pauses then
  const attention = clamp01(camera.focusedMs / (camera.checkedMs + Math.max(0, awayFromTabMs)))
  const phone = clamp01(1 - SCORE.phonePenalty * (camera.phoneMs / camera.checkedMs))
  const posture =
    camera.postureCheckedMs > 0 ? clamp01(camera.goodPostureMs / camera.postureCheckedMs) : null

  const weighted =
    posture === null
      ? (SCORE.attentionWeight * attention + SCORE.phoneWeight * phone) /
        (SCORE.attentionWeight + SCORE.phoneWeight)
      : SCORE.attentionWeight * attention +
        SCORE.phoneWeight * phone +
        SCORE.postureWeight * posture

  return { score: Math.round(100 * weighted), attention, phone, posture }
}

/** Score for a saved session (null if the camera wasn't on long enough). */
export function sessionScore(session: Session): FocusScore | null {
  return focusScore(session.camera, session.awayMs)
}

/**
 * Average score over several sessions, weighted by how long the camera watched each one,
 * so a 50 minute session counts more than a 5 minute one. Null if none can be scored.
 */
export function averageScore(sessions: Session[]): number | null {
  let total = 0
  let weight = 0
  for (const s of sessions) {
    const result = sessionScore(s)
    if (!result || !s.camera) continue
    total += result.score * s.camera.checkedMs
    weight += s.camera.checkedMs
  }
  return weight === 0 ? null : Math.round(total / weight)
}
