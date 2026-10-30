// When the camera checks run. Plain functions, so the timing rules can be unit tested.
// The numbers behind them are in docs/PERFORMANCE.md.

/** Detection may use at most this share of the main thread, even on a slow computer. */
export const MAX_BUSY_SHARE = 0.25
/**
 * The longest wait between checks. Under the 1 s that one face check may count for (see
 * useAttention), so a slow computer still gets every second of focus time counted.
 */
export const MAX_DELAY_MS = 800

/**
 * How long to wait after a check that took `lastCheckMs`. Normally `baseMs` (200 ms). A check
 * taking longer than a quarter of that pushes the next one back, so that checking uses at most
 * MAX_BUSY_SHARE of the time: busy / (busy + wait) ≤ 0.25 means wait ≥ 3 × busy.
 */
export function nextCheckDelay(lastCheckMs: number, baseMs: number): number {
  const wait = (lastCheckMs * (1 - MAX_BUSY_SHARE)) / MAX_BUSY_SHARE
  return Math.round(Math.min(MAX_DELAY_MS, Math.max(baseMs, wait)))
}

export type ExtraCheck = 'objects' | 'pose'

interface Due {
  /** When it last ran (ms), or -Infinity if never */
  lastAt: number
  /** Run at most this often (ms) */
  everyMs: number
  /** Loaded and switched on */
  wanted: boolean
}

/**
 * Which of the slower models to run with this face check: the object detector, Pose, or
 * neither. Never both: together with the face they took over 50 ms, long enough to make the
 * page stutter. When both are due, the one that has waited longer goes first; the other goes
 * on the next check, 200 ms later.
 */
export function pickExtraCheck(now: number, objects: Due, pose: Due): ExtraCheck | null {
  const overdue = (d: Due) => (d.wanted ? now - d.lastAt - d.everyMs : -1)
  const o = overdue(objects)
  const p = overdue(pose)
  if (o < 0 && p < 0) return null
  return o >= p ? 'objects' : 'pose'
}
