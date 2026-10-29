export const SECOND = 1000
export const MINUTE = 60 * SECOND
export const HOUR = 60 * MINUTE

export function minutesToMs(minutes: number): number {
  return minutes * MINUTE
}

/** Time left until `endsAt`, never negative. */
export function remainingMs(endsAt: number, now: number = Date.now()): number {
  return Math.max(0, endsAt - now)
}

/**
 * Countdown display: "25:00", "4:09", "1:05:00".
 * Rounds seconds up so the clock shows 0:00 only when time is really up.
 */
export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / SECOND)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const ss = String(seconds).padStart(2, '0')

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`
  }
  return `${minutes}:${ss}`
}

/** Summary display: "21s", "45m", "1h 30m". Seconds only under a minute; otherwise rounds down to minutes. */
export function formatDuration(ms: number): string {
  const safeMs = Math.max(0, ms)
  if (safeMs < MINUTE) return `${Math.floor(safeMs / SECOND)}s`

  const totalMinutes = Math.floor(safeMs / MINUTE)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  return `${minutes}m`
}

/** Clock time in the user's locale, e.g. "14:05" or "2:05 PM". */
export function formatTimeOfDay(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** Midnight (local time) at the start of the day containing `timestamp`. */
export function startOfDay(timestamp: number = Date.now()): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Midnight (local time) on the Monday of the week containing `timestamp`. */
export function startOfWeek(timestamp: number = Date.now()): number {
  const date = new Date(startOfDay(timestamp))
  const daysSinceMonday = (date.getDay() + 6) % 7 // getDay(): Sunday = 0
  date.setDate(date.getDate() - daysSinceMonday)
  return date.getTime()
}

/** The same local time `days` days later (or earlier), handling daylight saving changes. */
export function addDays(timestamp: number, days: number): number {
  const date = new Date(timestamp)
  date.setDate(date.getDate() + days)
  return date.getTime()
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b)
}
