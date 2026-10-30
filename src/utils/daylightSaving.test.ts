// Days and weeks across daylight-saving changes, in London time (clocks go forward on
// 29 March 2026 and back on 25 October 2026). A day is 23 or 25 hours then, so anything
// that adds 24 hours instead of a calendar day puts sessions on the wrong day.
// Each test file runs in its own process, so changing the time zone here affects only it.
import { afterAll, describe, expect, it, vi } from 'vitest'

// Before any dates are made below (the imported modules make none when loaded)
vi.stubEnv('TZ', 'Europe/London')

afterAll(() => {
  vi.unstubAllEnvs()
})

import type { Session } from '../types'
import { dailySeries, weeklySeries } from './dashboard'
import { summarizeDay } from './stats'
import { HOUR, addDays, startOfDay, startOfWeek } from './time'

const MIN = 60_000
const local = (month: number, day: number, hour = 0, minute = 0) =>
  new Date(2026, month, day, hour, minute).getTime()
/** Local date and time as text, to compare without thinking in milliseconds */
const show = (t: number) => {
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

function session(startedAt: number): Session {
  return {
    id: String(startedAt),
    intention: 'study',
    startedAt,
    endedAt: startedAt + 25 * MIN,
    plannedMinutes: 25,
    completed: true,
    tabLeaves: 0,
    awayMs: 0,
    distractions: [],
  }
}

// Only meaningful if the time zone really switched (it can't on some systems)
const londonApplies =
  new Date(2026, 0, 15).getTimezoneOffset() === 0 &&
  new Date(2026, 6, 15).getTimezoneOffset() === -60

describe.runIf(londonApplies)('across daylight-saving changes (London)', () => {
  it('has a 23-hour day when the clocks go forward, and a 25-hour day when they go back', () => {
    expect(addDays(local(2, 29), 1) - local(2, 29)).toBe(23 * HOUR)
    expect(addDays(local(9, 25), 1) - local(9, 25)).toBe(25 * HOUR)
    // …and still lands on local midnight
    expect(show(addDays(local(2, 28), 2))).toBe('3/30 0:00')
    expect(show(addDays(local(9, 26), -2))).toBe('10/24 0:00')
  })

  it('finds midnight and Monday on the change days', () => {
    expect(show(startOfDay(local(2, 29, 23, 30)))).toBe('3/29 0:00')
    expect(show(startOfDay(local(9, 25, 23, 30)))).toBe('10/25 0:00')
    // Sunday 29 March belongs to the week starting Monday 23 March
    expect(show(startOfWeek(local(2, 29, 23, 30)))).toBe('3/23 0:00')
    expect(show(startOfWeek(local(9, 26, 0, 30)))).toBe('10/26 0:00')
  })

  it('puts late-night sessions on the right day in the daily chart', () => {
    const lateSunday = session(local(2, 29, 23, 30))
    const earlyMonday = session(local(2, 30, 0, 30))
    const days = dailySeries([lateSunday, earlyMonday], local(2, 31, 12))

    expect(days.map((d) => show(d.start))).toEqual([
      '3/25 0:00',
      '3/26 0:00',
      '3/27 0:00',
      '3/28 0:00',
      '3/29 0:00',
      '3/30 0:00',
      '3/31 0:00',
    ])
    expect(days.map((d) => d.sessions)).toEqual([0, 0, 0, 0, 1, 1, 0])
  })

  it('counts both ends of the 25-hour day as today', () => {
    const sessions = [session(local(9, 25, 0, 10)), session(local(9, 25, 23, 40))]
    expect(summarizeDay(sessions, local(9, 25, 12)).started).toBe(2)
    expect(summarizeDay(sessions, local(9, 26, 0, 5)).started).toBe(0)
  })

  it('splits weeks at Monday midnight across the change', () => {
    const weeks = weeklySeries(
      [session(local(2, 29, 23, 30)), session(local(2, 30, 0, 30))],
      local(2, 31, 12),
      2,
    )
    expect(weeks.map((w) => show(w.start))).toEqual(['3/23 0:00', '3/30 0:00'])
    expect(weeks.map((w) => w.sessions)).toEqual([1, 1])
  })
})
