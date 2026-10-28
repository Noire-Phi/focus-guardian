import { describe, expect, it } from 'vitest'
import {
  CALIBRATION,
  addSample,
  checkGap,
  finishRun,
  median,
  runPhase,
  runProgress,
  startRun,
} from './calibration'

const { settleMs, sampleMs } = CALIBRATION
const pose = (yawDeg: number, pitchDeg: number) => ({ yawDeg, pitchDeg })

describe('a calibration run', () => {
  it('settles, records for 2 seconds, then completes', () => {
    const run = startRun('screen', 1000)
    expect(runPhase(run, 1000 + settleMs - 1)).toBe('settle')
    expect(runPhase(run, 1000 + settleMs)).toBe('recording')
    expect(runProgress(run, 1000 + settleMs + sampleMs / 2)).toBeCloseTo(0.5)
    expect(runPhase(run, 1000 + settleMs + sampleMs)).toBe('complete')
    expect(runProgress(run, 99_999)).toBe(1)
  })

  it('keeps samples only while recording, and skips frames without a face', () => {
    let run = startRun('book', 0)
    run = addSample(run, pose(1, -40), 100) // still settling
    run = addSample(run, pose(1, -40), settleMs + 100)
    run = addSample(run, null, settleMs + 300)
    run = addSample(run, pose(2, -41), settleMs + sampleMs + 1) // already complete
    expect(run.samples).toEqual([pose(1, -40)])
  })

  it('uses the median, so a few odd frames do not move the result', () => {
    let run = startRun('screen', 0)
    const samples = [pose(1, -5), pose(2, -6), pose(40, 30), pose(1, -4), pose(2, -5), pose(3, -5)]
    samples.forEach((p, i) => (run = addSample(run, p, settleMs + i * 200)))
    expect(finishRun(run)).toEqual({ ok: true, pose: pose(2, -5) })
  })

  it('fails with a clear message when the face was not seen enough', () => {
    const run = addSample(startRun('screen', 0), pose(0, 0), settleMs)
    const result = finishRun(run)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/face/i)
  })
})

it('median handles odd and even counts', () => {
  expect(median([3, 1, 2])).toBe(2)
  expect(median([4, 1, 3, 2])).toBe(2.5)
})

describe('checkGap', () => {
  it('accepts a book position clearly apart from the screen', () => {
    expect(checkGap(pose(0, -5), pose(0, -40))).toBeNull()
  })

  it('rejects a book position too close to the screen', () => {
    expect(checkGap(pose(0, -5), pose(3, -9))).toMatch(/too close/)
  })
})
