import { describe, expect, it } from 'vitest'
import type { CameraStats, Distraction, Session } from '../types'
import {
  LEFT_TAB,
  NO_NOTE,
  dailySeries,
  studyTotals,
  topDistractions,
  weeklySeries,
} from './dashboard'

const MIN = 60_000
// Wednesday 29 October 2026, 6 pm local time
const NOW = new Date(2026, 9, 29, 18).getTime()
const at = (month: number, day: number, hour = 9) => new Date(2026, month, day, hour).getTime()

/** A session of `minutes`; `focused` minutes on task gives a score when there's camera time. */
function session(
  startedAt: number,
  minutes = 25,
  {
    focused,
    tabLeaves = 0,
    notes = [] as string[],
  }: { focused?: number; tabLeaves?: number; notes?: string[] } = {},
): Session {
  const camera: CameraStats | undefined =
    focused === undefined
      ? undefined
      : {
          checkedMs: minutes * MIN,
          focusedMs: focused * MIN,
          phoneMs: 0,
          postureCheckedMs: 0,
          goodPostureMs: 0,
        }
  const distractions: Distraction[] = notes.map((note, i) => ({ at: startedAt + i, note }))
  return {
    id: `${startedAt}-${minutes}`,
    intention: 'study',
    startedAt,
    endedAt: startedAt + minutes * MIN,
    plannedMinutes: 25,
    completed: true,
    tabLeaves,
    awayMs: 0,
    distractions,
    camera,
  }
}

describe('dailySeries', () => {
  it('gives the last 7 days, oldest first, ending today', () => {
    const days = dailySeries([], NOW)
    expect(days).toHaveLength(7)
    expect(days[0].start).toBe(new Date(2026, 9, 23).getTime())
    expect(days[6].start).toBe(new Date(2026, 9, 29).getTime())
    expect(days.every((d) => d.score === null && d.studyMs === 0 && d.sessions === 0)).toBe(true)
  })

  it('puts sessions on the day they started, with score and study time', () => {
    const days = dailySeries(
      [
        session(at(9, 29, 9), 25, { focused: 25 }), // today, 100%
        session(at(9, 29, 14), 20), // today, no camera
        session(at(9, 27), 25, { focused: 15 }), // Monday: (0.6 × 0.6 + 0.25) / 0.85 = 72%
        session(at(9, 20)), // 9 days ago: outside the window
      ],
      NOW,
    )
    expect(days[6]).toMatchObject({ score: 100, studyMs: 45 * MIN, sessions: 2 })
    expect(days[4]).toMatchObject({ score: 72, studyMs: 25 * MIN, sessions: 1 })
    expect(days.reduce((n, d) => n + d.sessions, 0)).toBe(3)
  })

  it('caps study time at the planned length', () => {
    expect(dailySeries([session(at(9, 29), 90)], NOW)[6].studyMs).toBe(25 * MIN)
  })
})

describe('weeklySeries', () => {
  it('gives the last 8 weeks, each starting on Monday', () => {
    const weeks = weeklySeries([], NOW)
    expect(weeks).toHaveLength(8)
    expect(weeks.every((w) => new Date(w.start).getDay() === 1)).toBe(true)
    expect(weeks[7].start).toBe(new Date(2026, 9, 26).getTime()) // this week's Monday
    expect(weeks[0].start).toBe(new Date(2026, 8, 7).getTime()) // 7 weeks before
  })

  it('adds up each week, Monday to Sunday', () => {
    const weeks = weeklySeries(
      [
        session(at(9, 26), 25, { focused: 25 }), // this Monday
        session(at(9, 25), 25, { focused: 25 }), // last Sunday: previous week
        session(at(9, 19), 25), // last Monday
      ],
      NOW,
    )
    expect(weeks[7]).toMatchObject({ sessions: 1, score: 100 })
    expect(weeks[6]).toMatchObject({ sessions: 2, studyMs: 50 * MIN, score: 100 })
  })
})

describe('studyTotals', () => {
  it("adds up all-time and this week, with this week's score", () => {
    const totals = studyTotals(
      [session(at(9, 28), 25, { focused: 25 }), session(at(9, 1), 20)],
      NOW,
    )
    expect(totals).toEqual({
      allTimeMs: 45 * MIN,
      thisWeekMs: 25 * MIN,
      sessions: 2,
      weekScore: 100,
    })
  })

  it('is all zeros with no sessions', () => {
    expect(studyTotals([], NOW)).toEqual({
      allTimeMs: 0,
      thisWeekMs: 0,
      sessions: 0,
      weekScore: null,
    })
  })
})

describe('topDistractions', () => {
  it('groups notes ignoring case and spaces, and counts tab leaves', () => {
    const top = topDistractions([
      session(at(9, 28), 25, { notes: ['Phone', 'phone ', 'Hungry'], tabLeaves: 4 }),
      session(at(9, 29), 25, { notes: ['  PHONE', '', 'hungry'], tabLeaves: 1 }),
    ])
    expect(top).toEqual([
      { label: LEFT_TAB, count: 5 },
      { label: 'Phone', count: 3 },
      { label: 'Hungry', count: 2 },
      { label: NO_NOTE, count: 1 },
    ])
  })

  it('keeps the most common few', () => {
    const notes = ['a', 'b', 'b', 'c', 'c', 'c', 'd', 'e', 'f']
    expect(topDistractions([session(at(9, 29), 25, { notes })], 3).map((d) => d.label)).toEqual([
      'C',
      'B',
      'A',
    ])
  })

  it('shows each entry starting with a capital, whatever was typed first', () => {
    const top = topDistractions([session(at(9, 29), 25, { notes: ['phone', 'Phone'] })])
    expect(top).toEqual([{ label: 'Phone', count: 2 }])
  })

  it('is empty when nothing was logged', () => {
    expect(topDistractions([session(at(9, 29))])).toEqual([])
  })
})
