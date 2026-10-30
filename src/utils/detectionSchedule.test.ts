import { describe, expect, it } from 'vitest'
import { MAX_BUSY_SHARE, MAX_DELAY_MS, nextCheckDelay, pickExtraCheck } from './detectionSchedule'

describe('nextCheckDelay', () => {
  it('keeps the normal 200 ms when checks are quick', () => {
    expect(nextCheckDelay(0, 200)).toBe(200)
    expect(nextCheckDelay(25, 200)).toBe(200)
    expect(nextCheckDelay(50, 200)).toBe(200)
  })

  it('waits three times as long as a slow check took, so checking stays at a quarter', () => {
    expect(nextCheckDelay(100, 200)).toBe(300)
    const busy = 120
    const wait = nextCheckDelay(busy, 200)
    expect(busy / (busy + wait)).toBeCloseTo(MAX_BUSY_SHARE)
  })

  it('never waits longer than the cap, so focus time is still counted', () => {
    expect(nextCheckDelay(1000, 200)).toBe(MAX_DELAY_MS)
    expect(MAX_DELAY_MS).toBeLessThan(1000)
  })
})

describe('pickExtraCheck', () => {
  const every = 500
  const due = (lastAt: number, wanted = true) => ({ lastAt, everyMs: every, wanted })

  it('runs nothing extra when neither is due or wanted', () => {
    expect(pickExtraCheck(1000, due(800), due(900))).toBeNull()
    expect(pickExtraCheck(1000, due(0, false), due(0, false))).toBeNull()
  })

  it('runs whichever one is due', () => {
    expect(pickExtraCheck(1000, due(400), due(900))).toBe('objects')
    expect(pickExtraCheck(1000, due(900), due(400))).toBe('pose')
    expect(pickExtraCheck(1000, due(0, false), due(400))).toBe('pose')
  })

  it('when both are due, runs the one that has waited longer', () => {
    expect(pickExtraCheck(1000, due(300), due(450))).toBe('objects')
    expect(pickExtraCheck(1000, due(450), due(300))).toBe('pose')
    expect(pickExtraCheck(1000, due(-Infinity), due(-Infinity))).toBe('objects')
  })
})
