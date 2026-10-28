// Calibration: record where your head points when you look at the screen and at your
// book or paper. Plain functions; the hook in hooks/useCalibration.ts feeds them frames.

import type { Pose } from './attention'

export const CALIBRATION = {
  // Time to get into position before recording starts
  settleMs: 1500,
  // How long each position is recorded
  sampleMs: 2000,
  // Frames with a face needed for a usable recording (about half of 2 s at 5 checks/s)
  minSamples: 5,
  // The screen and book positions must be at least this far apart to tell them apart
  minGapDeg: 10,
} as const

export type CalibrationTarget = 'screen' | 'book'

export interface CalibrationRun {
  target: CalibrationTarget
  startedAt: number
  samples: Pose[]
}

export function startRun(target: CalibrationTarget, now: number): CalibrationRun {
  return { target, startedAt: now, samples: [] }
}

export type RunPhase = 'settle' | 'recording' | 'complete'

export function runPhase(run: CalibrationRun, now: number): RunPhase {
  const elapsed = now - run.startedAt
  if (elapsed < CALIBRATION.settleMs) return 'settle'
  if (elapsed < CALIBRATION.settleMs + CALIBRATION.sampleMs) return 'recording'
  return 'complete'
}

/** 0 to 1 across the recording part (0 while settling). */
export function runProgress(run: CalibrationRun, now: number): number {
  const recorded = now - run.startedAt - CALIBRATION.settleMs
  return Math.min(1, Math.max(0, recorded / CALIBRATION.sampleMs))
}

/** Adds a frame's head pose while recording. Frames without a face are skipped. */
export function addSample(run: CalibrationRun, pose: Pose | null, now: number): CalibrationRun {
  if (!pose || runPhase(run, now) !== 'recording') return run
  return { ...run, samples: [...run.samples, pose] }
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export type RunResult = { ok: true; pose: Pose } | { ok: false; error: string }

/**
 * The recorded position: the median of the samples, so a few odd frames (a blink, a
 * twitch) don't pull it off.
 */
export function finishRun(run: CalibrationRun): RunResult {
  if (run.samples.length < CALIBRATION.minSamples) {
    return {
      ok: false,
      error:
        "Couldn't see your face clearly enough. Make sure your face is in the camera view and well lit, then try again.",
    }
  }
  return {
    ok: true,
    pose: {
      yawDeg: median(run.samples.map((s) => s.yawDeg)),
      pitchDeg: median(run.samples.map((s) => s.pitchDeg)),
    },
  }
}

/** Checks the book position is far enough from the screen position to tell them apart. */
export function checkGap(screen: Pose, book: Pose): string | null {
  const gap = Math.hypot(screen.yawDeg - book.yawDeg, screen.pitchDeg - book.pitchDeg)
  if (gap >= CALIBRATION.minGapDeg) return null
  return 'The book position was too close to the screen position. Put your book or paper where you normally read (usually lower, on the desk), look down at it, and try again.'
}
