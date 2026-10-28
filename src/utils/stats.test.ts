import { describe, expect, it } from 'vitest'
import type { Session } from '../types'
import { summarizeDay } from './stats'

const MIN = 60_000
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime()

function session(startedAt: number, minutes: number, extra: Partial<Session> = {}): Session {
  return {
    id: String(startedAt),
    intention: 'work',
    startedAt,
    endedAt: startedAt + minutes * MIN,
    plannedMinutes: 25,
    completed: true,
    tabLeaves: 0,
    awayMs: 0,
    distractions: [],
    ...extra,
  }
}

describe('summarizeDay', () => {
  it('is all zeros with no sessions', () => {
    expect(summarizeDay([], at(29, 12))).toEqual({
      started: 0,
      completed: 0,
      focusMs: 0,
      distractions: 0,
      tabLeaves: 0,
    })
  })

  it("adds up only today's sessions", () => {
    const sessions = [
      session(at(28, 23), 25, { tabLeaves: 9 }), // yesterday
      session(at(29, 9), 25, { tabLeaves: 2, distractions: [{ at: 1, note: 'phone' }] }),
      session(at(29, 11), 7, {
        completed: false,
        tabLeaves: 1,
        distractions: [
          { at: 1, note: '' },
          { at: 2, note: 'chat' },
        ],
      }),
    ]

    expect(summarizeDay(sessions, at(29, 18))).toEqual({
      started: 2,
      completed: 1,
      focusMs: (25 + 7) * MIN,
      distractions: 3,
      tabLeaves: 3,
    })
  })

  it('caps focus time at the planned length (paused time is not recorded)', () => {
    expect(summarizeDay([session(at(29, 10), 40)], at(29, 12)).focusMs).toBe(25 * MIN)
  })
})
