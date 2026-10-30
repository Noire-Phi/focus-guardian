import { describe, expect, it } from 'vitest'
import { countEvent, perfSummary, recordTiming, resetPerf } from './perfStats'

describe('perfStats', () => {
  it('summarises runs and the share of time they used', () => {
    resetPerf(0)
    recordTiming('face', 10)
    recordTiming('face', 30)
    recordTiming('face', 20)
    countEvent('hiddenPause')
    const summary = perfSummary(1000)
    expect(summary.seconds).toBe(1)
    expect(summary.tasks.face).toEqual({
      runs: 3,
      medianMs: 20,
      meanMs: 20,
      maxMs: 30,
      busyPercent: 6,
    })
    expect(summary.events).toEqual({ hiddenPause: 1 })
  })

  it('starts over on reset', () => {
    recordTiming('pose', 5)
    resetPerf(0)
    expect(perfSummary(1000).tasks).toEqual({})
  })
})
