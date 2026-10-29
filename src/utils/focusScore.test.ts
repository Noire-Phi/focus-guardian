import { describe, expect, it } from 'vitest'
import type { CameraStats, Session } from '../types'
import {
  EMPTY_CAMERA_STATS,
  addCameraStats,
  averageScore,
  focusScore,
  frameSpanMs,
  sessionScore,
} from './focusScore'

const MIN = 60_000

/** Camera stats for `checked` minutes, with the rest given as minutes too. */
function stats(
  checked: number,
  { focused = checked, phone = 0, postureChecked = 0, goodPosture = 0 } = {},
): CameraStats {
  return {
    checkedMs: checked * MIN,
    focusedMs: focused * MIN,
    phoneMs: phone * MIN,
    postureCheckedMs: postureChecked * MIN,
    goodPostureMs: goodPosture * MIN,
  }
}

describe('focusScore', () => {
  it('is 100% for a perfect session', () => {
    expect(focusScore(stats(25, { postureChecked: 25, goodPosture: 25 }), 0)).toEqual({
      score: 100,
      attention: 1,
      phone: 1,
      posture: 1,
    })
  })

  it('weights attention 60%, phone 25% and posture 15%', () => {
    // Half on task, no phone, half good posture:
    // 0.6 × 0.5 + 0.25 × 1 + 0.15 × 0.5 = 0.625 → 63%
    const result = focusScore(stats(20, { focused: 10, postureChecked: 20, goodPosture: 10 }), 0)
    expect(result).toMatchObject({ attention: 0.5, phone: 1, posture: 0.5 })
    expect(result?.score).toBe(63)
  })

  it('matches the step-by-step example in docs/FOCUS_SCORE.md', () => {
    const camera = stats(25, { focused: 24, phone: 2.5, postureChecked: 20, goodPosture: 18 })
    const result = focusScore(camera, 5 * MIN)
    expect(result?.attention).toBeCloseTo(0.8)
    expect(result?.phone).toBeCloseTo(0.7)
    expect(result?.posture).toBeCloseTo(0.9)
    expect(result?.score).toBe(79)
  })

  it('counts time in another tab as not on task', () => {
    // 10 min on task out of 10 min watched + 10 min in another tab: attention 0.5
    expect(focusScore(stats(10), 10 * MIN)?.attention).toBe(0.5)
  })

  it('takes 3% off the phone part for each 1% of time on the phone', () => {
    expect(focusScore(stats(100, { phone: 10, focused: 90 }), 0)?.phone).toBeCloseTo(0.7)
    // A third of the time or more on the phone: the phone part is 0
    expect(focusScore(stats(30, { phone: 10, focused: 20 }), 0)?.phone).toBe(0)
    expect(focusScore(stats(30, { phone: 20, focused: 10 }), 0)?.phone).toBe(0)
  })

  it('shares the posture weight out when posture was not checked', () => {
    // (0.6 × 0.5 + 0.25 × 1) / 0.85 = 0.647 → 65%
    const result = focusScore(stats(20, { focused: 10 }), 0)
    expect(result?.posture).toBeNull()
    expect(result?.score).toBe(65)
  })

  it('is 0% when nothing went right', () => {
    expect(focusScore(stats(10, { focused: 0, phone: 10, postureChecked: 10 }), 0)?.score).toBe(0)
  })

  it('gives no score without enough camera time', () => {
    expect(focusScore(undefined, 0)).toBeNull()
    expect(focusScore(stats(0.9), 0)).toBeNull()
    expect(focusScore(stats(1), 0)).not.toBeNull()
  })

  it('stays between 0 and 100 even with odd numbers', () => {
    const odd = { ...stats(10), focusedMs: 20 * MIN, goodPostureMs: 5 * MIN, postureCheckedMs: MIN }
    expect(focusScore(odd, -5000)?.score).toBe(100)
  })
})

describe('averageScore', () => {
  const session = (camera?: CameraStats, awayMs = 0) => ({ awayMs, camera }) as unknown as Session

  it('weights each session by how long the camera watched it', () => {
    // 100% for 10 min and 50%-attention (65%) for 30 min: (100×10 + 65×30) / 40 = 73.75 → 74
    const sessions = [session(stats(10)), session(stats(30, { focused: 15 }))]
    expect(averageScore(sessions)).toBe(74)
  })

  it('skips sessions without a score, and is null when none have one', () => {
    expect(averageScore([session(stats(10)), session(undefined)])).toBe(100)
    expect(averageScore([session(undefined)])).toBeNull()
    expect(averageScore([])).toBeNull()
  })

  it("sessionScore uses the session's time away from the tab", () => {
    expect(sessionScore(session(stats(10), 10 * MIN))?.attention).toBe(0.5)
  })
})

describe('helpers', () => {
  it('addCameraStats adds up time, treating missing fields as 0', () => {
    const a = addCameraStats(EMPTY_CAMERA_STATS, { checkedMs: 200, focusedMs: 200 })
    expect(addCameraStats(a, { checkedMs: 200, phoneMs: 200 })).toEqual({
      checkedMs: 400,
      focusedMs: 200,
      phoneMs: 200,
      postureCheckedMs: 0,
      goodPostureMs: 0,
    })
  })

  it('frameSpanMs is the time since the last check, capped, and 0 for the first', () => {
    expect(frameSpanMs(null, 5000, 1000)).toBe(0)
    expect(frameSpanMs(4800, 5000, 1000)).toBe(200)
    expect(frameSpanMs(1000, 9000, 1000)).toBe(1000)
    expect(frameSpanMs(5000, 4000, 1000)).toBe(0)
  })
})
