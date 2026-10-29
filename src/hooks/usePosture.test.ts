// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { measurePosture, type Landmark, type PostureMetrics } from '../utils/posture'
import { body } from '../utils/posture.testutil'
import type { TrackerFrame } from './useFaceTracker'
import { usePosture } from './usePosture'

const baseline = measurePosture(body()) as PostureMetrics
const SLOUCHING = body({ head: 0.5 })
const UPRIGHT = body()

const frame = (at: number, landmarks: Landmark[] | null | undefined): TrackerFrame => ({
  at,
  hidden: false,
  face: null,
  objects: null,
  // undefined = a frame where posture wasn't checked
  pose: landmarks === undefined ? null : { landmarks },
})

function setup(watching = true, base: PostureMetrics | null = baseline) {
  const onAlert = vi.fn()
  const hook = renderHook(
    (props: { watching: boolean; baseline: PostureMetrics | null }) =>
      usePosture({ ...props, onAlert }),
    { initialProps: { watching, baseline: base } },
  )
  /** Sends a posture check every 500 ms from `from` for `ms`. */
  const feed = (landmarks: Landmark[] | null, from: number, ms: number) => {
    for (let at = from; at <= from + ms; at += 500) {
      act(() => hook.result.current.handleFrame(frame(at, landmarks)))
    }
  }
  return { ...hook, onAlert, feed }
}

describe('usePosture', () => {
  it('does nothing without a calibrated posture, or while not watching', () => {
    for (const [watching, base] of [
      [true, null],
      [false, baseline],
    ] as const) {
      const { result, feed, onAlert } = setup(watching, base)
      feed(SLOUCHING, 0, 60_000)
      expect(result.current).toMatchObject({ reading: null, alerting: false, badForMs: 0 })
      expect(onAlert).not.toHaveBeenCalled()
    }
  })

  it('reports good posture', () => {
    const { result, feed } = setup()
    feed(UPRIGHT, 0, 1000)
    expect(result.current.reading).toEqual({ status: 'good', issues: [] })
  })

  it('alerts once after 20 seconds of bad posture, not before', () => {
    const { result, feed, onAlert } = setup()
    feed(SLOUCHING, 0, 19_500)
    expect(result.current.reading?.issues).toEqual(['slouching'])
    expect(result.current.badForMs).toBe(19_500)
    expect(result.current.alerting).toBe(false)

    feed(SLOUCHING, 20_000, 0)
    expect(result.current.alerting).toBe(true)
    feed(SLOUCHING, 20_500, 20_000)
    expect(onAlert).toHaveBeenCalledTimes(1)
  })

  it('shifting for a moment does not restart the count; 3 seconds upright clears it', () => {
    const { result, feed } = setup()
    feed(SLOUCHING, 0, 10_000)
    feed(UPRIGHT, 10_500, 2000) // under 3 s
    feed(SLOUCHING, 13_000, 7000)
    expect(result.current.alerting).toBe(true)

    feed(UPRIGHT, 20_500, 2500)
    expect(result.current.alerting).toBe(true)
    feed(UPRIGHT, 23_500, 0)
    expect(result.current.alerting).toBe(false)
  })

  it('ignores checks where it cannot see your shoulders, and frames without a posture check', () => {
    const { result, feed } = setup()
    feed(SLOUCHING, 0, 5000)
    feed(null, 5500, 30_000)
    act(() => result.current.handleFrame(frame(36_000, undefined)))
    expect(result.current.reading?.status).toBe('unknown')
    expect(result.current.alerting).toBe(false)
  })

  it('starts over after recalibrating', () => {
    const { result, feed, rerender } = setup()
    feed(SLOUCHING, 0, 15_000)
    rerender({ watching: true, baseline: measurePosture(SLOUCHING) })
    feed(SLOUCHING, 15_500, 30_000)
    expect(result.current.reading?.status).toBe('good')
    expect(result.current.alerting).toBe(false)
  })
})
