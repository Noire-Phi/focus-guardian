import type { Session } from '../types'
import { averageScore, sessionScore } from './focusScore'
import { isSameDay, minutesToMs } from './time'

export interface DaySummary {
  started: number
  completed: number
  focusMs: number
  distractions: number
  tabLeaves: number
  /** Today's focus score (0–100), weighted by camera time; null with no camera data */
  focusScore: number | null
  /** The most recent scored session's focus score */
  lastScore: number | null
}

/**
 * Totals for the day containing `now`, worked out from saved history (never stored).
 * Focus time is each session's length capped at its planned length. Paused time isn't
 * recorded separately, so a session paused for a while can count a bit more than you
 * actually focused.
 */
export function summarizeDay(sessions: Session[], now: number): DaySummary {
  const today = sessions.filter((s) => isSameDay(s.startedAt, now))
  const scored = today
    .map((s) => ({ s, score: sessionScore(s) }))
    .filter((x) => x.score !== null)
    .sort((a, b) => a.s.endedAt - b.s.endedAt)
  return {
    started: today.length,
    completed: today.filter((s) => s.completed).length,
    focusMs: today.reduce(
      (sum, s) => sum + Math.min(s.endedAt - s.startedAt, minutesToMs(s.plannedMinutes)),
      0,
    ),
    distractions: today.reduce((sum, s) => sum + s.distractions.length, 0),
    tabLeaves: today.reduce((sum, s) => sum + s.tabLeaves, 0),
    focusScore: averageScore(today),
    lastScore: scored.at(-1)?.score?.score ?? null,
  }
}
