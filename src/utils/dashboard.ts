// Numbers for the dashboard, worked out from saved session history. Plain functions with
// no React or Chart.js, so they can be unit tested. Timestamps in, timestamps out: the
// dashboard turns them into labels in your language.

import type { Session } from '../types'
import { averageScore } from './focusScore'
import { sessionStudyMs } from './stats'
import { addDays, startOfDay, startOfWeek } from './time'

export interface PeriodPoint {
  start: number // local midnight at the start of the day or week
  score: number | null // focus score (0–100), null if no session in it was scored
  studyMs: number
  sessions: number
}

function summarize(start: number, sessions: Session[]): PeriodPoint {
  return {
    start,
    score: averageScore(sessions),
    studyMs: sessions.reduce((sum, s) => sum + sessionStudyMs(s), 0),
    sessions: sessions.length,
  }
}

/** One point per day for the last `days` days, oldest first, ending today. */
export function dailySeries(sessions: Session[], now: number, days = 7): PeriodPoint[] {
  const today = startOfDay(now)
  return Array.from({ length: days }, (_, i) => {
    const start = addDays(today, i - (days - 1))
    const end = addDays(start, 1)
    return summarize(
      start,
      sessions.filter((s) => s.startedAt >= start && s.startedAt < end),
    )
  })
}

/** One point per week (Monday to Sunday) for the last `weeks` weeks, oldest first. */
export function weeklySeries(sessions: Session[], now: number, weeks = 8): PeriodPoint[] {
  const thisWeek = startOfWeek(now)
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(thisWeek, 7 * (i - (weeks - 1)))
    const end = addDays(start, 7)
    return summarize(
      start,
      sessions.filter((s) => s.startedAt >= start && s.startedAt < end),
    )
  })
}

export interface StudyTotals {
  allTimeMs: number
  thisWeekMs: number
  sessions: number
  weekScore: number | null // this week's focus score
}

export function studyTotals(sessions: Session[], now: number): StudyTotals {
  const weekStart = startOfWeek(now)
  const thisWeek = sessions.filter((s) => s.startedAt >= weekStart)
  return {
    allTimeMs: sessions.reduce((sum, s) => sum + sessionStudyMs(s), 0),
    thisWeekMs: thisWeek.reduce((sum, s) => sum + sessionStudyMs(s), 0),
    sessions: sessions.length,
    weekScore: averageScore(thisWeek),
  }
}

export interface DistractionCount {
  label: string
  count: number
}

export const LEFT_TAB = 'Left the tab'
export const NO_NOTE = 'No note'

/**
 * The most common distractions: notes you logged, grouped ignoring case and extra spaces
 * ("Phone", "phone " → one entry), plus every time you left the tab. Most common first;
 * ties keep the label that was seen first.
 */
export function topDistractions(sessions: Session[], limit = 5): DistractionCount[] {
  const counts = new Map<string, DistractionCount>()
  const bump = (label: string, by = 1) => {
    const key = label.trim().replace(/\s+/g, ' ').toLowerCase()
    const entry = counts.get(key)
    if (entry) entry.count += by
    else counts.set(key, { label: label.trim().replace(/\s+/g, ' '), count: by })
  }

  for (const s of sessions) {
    for (const d of s.distractions) bump(d.note.trim() === '' ? NO_NOTE : d.note)
    if (s.tabLeaves > 0) bump(LEFT_TAB, s.tabLeaves)
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count) // stable: ties stay in first-seen order
    .slice(0, limit)
}
