// How long each detection takes, kept in development only, so the cost of the camera checks
// can be read in the browser console: `focusGuardianPerf()`. In a production build these
// functions do nothing and are removed. See docs/PERFORMANCE.md.

export type PerfTask = 'face' | 'objects' | 'pose' | 'check'

interface TaskStats {
  count: number
  totalMs: number
  maxMs: number
  recent: number[] // the last RECENT runs, for the median
}

const RECENT = 100
const stats = new Map<string, TaskStats>()
const counters = new Map<string, number>()
let since = 0

/** Records one run of `task` that took `ms`. */
export function recordTiming(task: PerfTask, ms: number): void {
  if (!import.meta.env.DEV) return
  const s = stats.get(task) ?? { count: 0, totalMs: 0, maxMs: 0, recent: [] }
  s.count++
  s.totalMs += ms
  s.maxMs = Math.max(s.maxMs, ms)
  s.recent.push(ms)
  if (s.recent.length > RECENT) s.recent.shift()
  stats.set(task, s)
}

/** Counts an event, such as a loop tick while the tab was hidden. */
export function countEvent(name: string): void {
  if (!import.meta.env.DEV) return
  counters.set(name, (counters.get(name) ?? 0) + 1)
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]
}
const round = (ms: number) => Math.round(ms * 10) / 10

/** A summary since the last reset: runs, median, mean, max, and share of wall time. */
export function perfSummary(now: number = performance.now()) {
  const wallMs = Math.max(1, now - since)
  return {
    seconds: round(wallMs / 1000),
    tasks: Object.fromEntries(
      [...stats].map(([task, s]) => [
        task,
        {
          runs: s.count,
          medianMs: round(median(s.recent)),
          meanMs: round(s.totalMs / s.count),
          maxMs: round(s.maxMs),
          // Share of the main thread this task used over the period
          busyPercent: round((s.totalMs / wallMs) * 100),
        },
      ]),
    ),
    events: Object.fromEntries(counters),
  }
}

export function resetPerf(now: number = performance.now()): void {
  stats.clear()
  counters.clear()
  since = now
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  Object.assign(window, { focusGuardianPerf: perfSummary, focusGuardianPerfReset: resetPerf })
}
