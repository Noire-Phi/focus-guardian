// When the camera checks run. Plain functions, so the timing rules can be unit tested.
// The numbers behind them are in docs/PERFORMANCE.md.

/** Detection may use at most this share of the main thread, even on a slow computer. */
export const MAX_BUSY_SHARE = 0.25
/**
 * The longest wait between checks. Enough to keep a check of up to ~650 ms (a slow computer
 * without a GPU) at a quarter of the main thread.
 */
export const MAX_DELAY_MS = 2000
/**
 * The longest one face check may count for in the focus score: covers a check of up to
 * ~600 ms plus its wait (600 + 1800). Gaps from a hidden tab don't reach this: the checks reset when it's hidden.
 */
export const MAX_CHECK_GAP_MS = 2500

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
