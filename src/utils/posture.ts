// Posture: measure how you sit from MediaPipe Pose landmarks, and compare it with the
// "good posture" you calibrated. Plain functions; hooks/usePosture.ts feeds them frames.

import { median, type CalibrationRun } from './calibration'

export const POSTURE = {
  // Head sunk this much lower relative to your shoulders than when calibrated = slouching
  maxHeadDrop: 0.2,
  // Shoulders this much wider on camera than when calibrated = leaning in toward the screen
  maxLeanIn: 0.2,
  // Shoulder line tilted this many degrees more than when calibrated = leaning to one side
  maxTiltDeg: 10,
  // How sure Pose must be that a point is visible to use it
  minVisibility: 0.5,
  // Posture changes slowly: bad posture must last this long before an alert…
  alertAfterMs: 20_000,
  // …and good posture this long to clear it
  recoverAfterMs: 3000,
  // How often to check posture
  checkEveryMs: 500,
  // Calibration samples needed (about 4 come in during the 2 s recording)
  minSamples: 3,
} as const

// BlazePose landmark numbers (33 points in total)
const NOSE = 0
const LEFT_SHOULDER = 11
const RIGHT_SHOULDER = 12

export interface Landmark {
  x: number // 0 to 1 across the image
  y: number // 0 to 1 down the image
  visibility?: number
}

/**
 * Three numbers that describe how you sit, all measured relative to your shoulders, so
 * they don't change when you move around in the frame:
 * - headHeight: how far your nose is above your shoulders, in shoulder widths
 * - shoulderWidth: how wide your shoulders look (bigger = closer to the camera)
 * - tiltDeg: how much the line between your shoulders slopes
 */
export interface PostureMetrics {
  headHeight: number
  shoulderWidth: number
  tiltDeg: number
}

/** Measures one frame, or null if the nose or either shoulder isn't clearly visible. */
export function measurePosture(landmarks: Landmark[] | null): PostureMetrics | null {
  if (!landmarks) return null
  const nose = landmarks[NOSE]
  const left = landmarks[LEFT_SHOULDER]
  const right = landmarks[RIGHT_SHOULDER]
  const visible = (p: Landmark | undefined) =>
    p !== undefined && (p.visibility ?? 1) >= POSTURE.minVisibility
  if (!visible(nose) || !visible(left) || !visible(right)) return null

  const shoulderWidth = Math.hypot(left.x - right.x, left.y - right.y)
  if (shoulderWidth === 0) return null
  const shoulderMidY = (left.y + right.y) / 2
  return {
    headHeight: (shoulderMidY - nose.y) / shoulderWidth,
    shoulderWidth,
    // Image y grows downwards; abs() on x so it reads the same mirrored or not
    tiltDeg: (Math.atan2(left.y - right.y, Math.abs(left.x - right.x)) * 180) / Math.PI,
  }
}

export type PostureIssue = 'slouching' | 'leaning-in' | 'tilted'

export interface PostureReading {
  status: 'good' | 'bad' | 'unknown' // unknown: shoulders or face not visible
  issues: PostureIssue[]
}

/** Compares one frame with your calibrated good posture. */
export function comparePosture(
  metrics: PostureMetrics | null,
  baseline: PostureMetrics,
): PostureReading {
  if (!metrics) return { status: 'unknown', issues: [] }
  const issues: PostureIssue[] = []
  if (metrics.headHeight < baseline.headHeight * (1 - POSTURE.maxHeadDrop)) issues.push('slouching')
  if (metrics.shoulderWidth > baseline.shoulderWidth * (1 + POSTURE.maxLeanIn)) {
    issues.push('leaning-in')
  }
  if (Math.abs(metrics.tiltDeg - baseline.tiltDeg) > POSTURE.maxTiltDeg) issues.push('tilted')
  return { status: issues.length ? 'bad' : 'good', issues }
}

export type PostureResult = { ok: true; baseline: PostureMetrics } | { ok: false; error: string }

/** Your good posture: the median of each measurement over the recording. */
export function finishPostureRun(run: CalibrationRun<PostureMetrics>): PostureResult {
  if (run.samples.length < POSTURE.minSamples) {
    return {
      ok: false,
      error:
        "Couldn't see your head and shoulders clearly enough. Sit so both shoulders are in the camera view, then try again.",
    }
  }
  return {
    ok: true,
    baseline: {
      headHeight: median(run.samples.map((s) => s.headHeight)),
      shoulderWidth: median(run.samples.map((s) => s.shoulderWidth)),
      tiltDeg: median(run.samples.map((s) => s.tiltDeg)),
    },
  }
}
