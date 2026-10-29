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
      focusScore: null,
      lastScore: null,
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
      focusScore: null,
      lastScore: null,
    })
  })

  it('caps focus time at the planned length (paused time is not recorded)', () => {
    expect(summarizeDay([session(at(29, 10), 40)], at(29, 12)).focusMs).toBe(25 * MIN)
  })
})

describe('focus score in the day summary', () => {
  const MIN_ = 60_000
  const camera = (focusedMin: number, checkedMin = 10) => ({
    checkedMs: checkedMin * MIN_,
    focusedMs: focusedMin * MIN_,
    phoneMs: 0,
    postureCheckedMs: 0,
    goodPostureMs: 0,
  })

  it('averages scored sessions from today by camera time, and shows the latest', () => {
    const sessions = [
      session(at(28, 9), 25, { camera: camera(10) }), // yesterday: ignored
      session(at(29, 9), 25, { camera: camera(5, 30) }), // 30 min watched, half on task
      session(at(29, 11), 25, { camera: camera(10) }), // 10 min, all on task
      session(at(29, 13), 25), // no camera: not scored
    ]
    const day = summarizeDay(sessions, at(29, 18))
    // No posture data, so weights are 0.6 / 0.85 and 0.25 / 0.85:
    //   first:  (0.6 × 5/30 + 0.25 × 1) / 0.85 = 41%   (30 min of camera time)
    //   second: (0.6 × 1    + 0.25 × 1) / 0.85 = 100%  (10 min)
    //   today:  (41 × 30 + 100 × 10) / 40 = 55.75 → 56%
    expect(day.lastScore).toBe(100)
    expect(day.focusScore).toBe(56)
  })
})
