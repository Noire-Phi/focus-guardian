import { describe, expect, it } from 'vitest'
import { CALIBRATION, addSample, startRun } from './calibration'
import { comparePosture, finishPostureRun, measurePosture, type PostureMetrics } from './posture'
import { body } from './posture.testutil'

const good = measurePosture(body()) as PostureMetrics

describe('measurePosture', () => {
  it('measures head height in shoulder widths, shoulder width and tilt', () => {
    expect(good.headHeight).toBeCloseTo(0.9)
    expect(good.shoulderWidth).toBeCloseTo(0.3)
    expect(good.tiltDeg).toBeCloseTo(0)
  })

  it('reads the same wherever you sit in the frame and however far away', () => {
    const farther = measurePosture(body({ width: 0.15 })) as PostureMetrics
    expect(farther.headHeight).toBeCloseTo(good.headHeight)
  })

  it('measures a sloping shoulder line in degrees', () => {
    expect(measurePosture(body({ tilt: 0.3 }))?.tiltDeg).toBeCloseTo(45)
  })

  it('gives nothing when the shoulders or nose are not clearly visible', () => {
    expect(measurePosture(null)).toBeNull()
    expect(measurePosture(body({ visibility: 0.3 }))).toBeNull()
  })
})

describe('comparePosture', () => {
  it('good when close to your calibrated posture', () => {
    expect(comparePosture(measurePosture(body({ head: 0.8 })), good)).toEqual({
      status: 'good',
      issues: [],
    })
  })

  it('slouching when your head sinks more than 20% toward your shoulders', () => {
    expect(comparePosture(measurePosture(body({ head: 0.65 })), good).issues).toEqual(['slouching'])
  })

  it('leaning in when your shoulders look more than 20% wider (closer to the camera)', () => {
    expect(comparePosture(measurePosture(body({ width: 0.4 })), good).issues).toEqual([
      'leaning-in',
    ])
  })

  it('tilted when your shoulder line slopes more than 10° more than calibrated', () => {
    expect(comparePosture(measurePosture(body({ tilt: 0.08 })), good).issues).toEqual(['tilted'])
    expect(comparePosture(measurePosture(body({ tilt: 0.03 })), good).status).toBe('good')
  })

  it('can report several issues at once', () => {
    const reading = comparePosture(measurePosture(body({ head: 0.5, width: 0.4 })), good)
    expect(reading).toEqual({ status: 'bad', issues: ['slouching', 'leaning-in'] })
  })

  it('unknown when it cannot see you', () => {
    expect(comparePosture(null, good)).toEqual({ status: 'unknown', issues: [] })
  })
})

describe('finishPostureRun', () => {
  it('uses the median of each measurement', () => {
    let run = startRun<PostureMetrics>('posture', 0)
    const heads = [0.9, 0.92, 0.5, 0.88]
    heads.forEach((head, i) => {
      run = addSample(run, measurePosture(body({ head })), CALIBRATION.settleMs + i * 500)
    })
    const result = finishPostureRun(run)
    expect(result.ok && result.baseline.headHeight).toBeCloseTo(0.89)
  })

  it('fails with a clear message when your shoulders were not seen enough', () => {
    const run = addSample(startRun<PostureMetrics>('posture', 0), good, CALIBRATION.settleMs)
    const result = finishPostureRun(run)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/shoulders/)
  })
})
