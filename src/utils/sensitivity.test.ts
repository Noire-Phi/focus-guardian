import { describe, expect, it } from 'vitest'
import {
  ATTENTION,
  type AttentionRules,
  readFace,
  updateAttention,
  updatePhone,
  NO_PHONE,
  ATTENTIVE,
} from './attention'
import { POSTURE, comparePosture, measurePosture, type PostureMetrics } from './posture'
import { body } from './posture.testutil'
import { poseMatrix } from './poseMatrix.testutil'
import { SENSITIVITY_HINTS, tuningFor } from './sensitivity'

const low = tuningFor('low')
const medium = tuningFor('medium')
const high = tuningFor('high')

describe('tuningFor', () => {
  it('medium is exactly the defaults', () => {
    expect(medium.attention).toBe(ATTENTION)
    expect(medium.posture).toBe(POSTURE)
  })

  it('goes from forgiving (low) to strict (high) on every knob it changes', () => {
    const a = (k: keyof typeof ATTENTION) => [
      low.attention[k],
      medium.attention[k],
      high.attention[k],
    ]
    // Bigger = more forgiving
    for (const k of [
      'sidewaysDeg',
      'targetYawDeg',
      'targetPitchDeg',
      'alertAfterMs',
      'phoneScore',
      'phoneConfirmChecks',
    ] as const) {
      const [l, m, h] = a(k)
      expect(l).toBeGreaterThan(m)
      expect(m).toBeGreaterThan(h)
    }
    for (const k of ['maxHeadDrop', 'maxLeanIn', 'maxTiltDeg', 'alertAfterMs'] as const) {
      expect(low.posture[k]).toBeGreaterThan(medium.posture[k])
      expect(medium.posture[k]).toBeGreaterThan(high.posture[k])
    }
  })

  it('leaves the timing of checks alone', () => {
    for (const t of [low, high]) {
      expect(t.attention.checkEveryMs).toBe(ATTENTION.checkEveryMs)
      expect(t.attention.recoverAfterMs).toBe(ATTENTION.recoverAfterMs)
      expect(t.posture.checkEveryMs).toBe(POSTURE.checkEveryMs)
    }
  })

  it('has a hint for every level', () => {
    expect(Object.keys(SENSITIVITY_HINTS).sort()).toEqual(['high', 'low', 'medium'])
  })
})

describe('sensitivity changes what counts', () => {
  const face = (yaw: number) => ({ matrix: poseMatrix(yaw, 0), blendshapes: {} })
  const read = (yaw: number, rules: AttentionRules) =>
    readFace(face(yaw), { mode: 'screen', calibration: null, phoneConfirmed: false, rules }).reason

  it('a 24° head turn: on screen for low, off target for medium, sideways for high', () => {
    expect(read(24, low.attention)).toBe('on-screen')
    expect(read(24, medium.attention)).toBe('off-target')
    expect(read(24, high.attention)).toBe('sideways')
  })

  it('alerts after 10 s on low, 5 s on medium, 3 s on high', () => {
    const alertsAt = (rules: AttentionRules) => {
      let s = ATTENTIVE
      for (let t = 0; t <= 20_000; t += 200) {
        s = updateAttention(s, 'away', t, rules)
        if (s.alerting) return t
      }
      return null
    }
    expect([alertsAt(low.attention), alertsAt(medium.attention), alertsAt(high.attention)]).toEqual(
      [10_000, 5000, 3000],
    )
  })

  it('a 0.45 phone detection: ignored on low and medium, confirmed in 2 checks on high', () => {
    const checks = (n: number, rules: AttentionRules) =>
      Array.from({ length: n }).reduce<typeof NO_PHONE>(
        (t) => updatePhone(t, 0.45, rules),
        NO_PHONE,
      )
    expect(checks(5, low.attention).confirmed).toBe(false)
    expect(checks(5, medium.attention).confirmed).toBe(false)
    expect(checks(2, high.attention).confirmed).toBe(true)
  })

  it('a small slouch: good on low and medium, slouching on high', () => {
    const baseline = measurePosture(body()) as PostureMetrics
    const slight = measurePosture(body({ head: 0.77 })) // head 14% lower
    expect(comparePosture(slight, baseline, low.posture).status).toBe('good')
    expect(comparePosture(slight, baseline, medium.posture).status).toBe('good')
    expect(comparePosture(slight, baseline, high.posture).issues).toEqual(['slouching'])
  })
})
