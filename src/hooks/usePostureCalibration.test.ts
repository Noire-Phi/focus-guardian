// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CALIBRATION } from '../utils/calibration'
import type { Landmark } from '../utils/posture'
import { body } from '../utils/posture.testutil'
import { usePostureCalibration } from './usePostureCalibration'

const END = CALIBRATION.settleMs + CALIBRATION.sampleMs

function setup() {
  const onDone = vi.fn()
  const hook = renderHook(() => usePostureCalibration(onDone))
  /** Face checks every 200 ms; a posture check on every other one (400 ms). */
  const run = (landmarks: Landmark[] | null) => {
    for (let at = 0; at < END + 200; at += 200) {
      act(() =>
        hook.result.current.handleFrame({
          at,
          hidden: false,
          face: null,
          objects: null,
          pose: at % 400 === 0 ? { landmarks } : null,
        }),
      )
    }
  }
  return { ...hook, onDone, run }
}

describe('usePostureCalibration', () => {
  it('records your good posture and saves it', () => {
    const { result, onDone, run } = setup()
    act(() => result.current.start())
    expect(result.current.recording).toBe(true)
    run(body({ head: 0.95 }))
    expect(result.current.step).toBe('done')
    expect(onDone.mock.calls[0][0].headHeight).toBeCloseTo(0.95)
  })

  it('fails with a message when your shoulders are not visible', () => {
    const { result, onDone, run } = setup()
    act(() => result.current.start())
    run(null)
    expect(result.current.step).toBe('failed')
    expect(result.current.error).toMatch(/shoulders/)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('starts again after the tab was hidden partway', () => {
    const { result } = setup()
    act(() => result.current.start())
    const send = (at: number, hidden = false) =>
      act(() =>
        result.current.handleFrame({
          at,
          hidden,
          face: null,
          objects: null,
          pose: hidden ? null : { landmarks: body() },
        }),
      )
    send(0)
    // Partway through recording, after the moment to get ready
    send(CALIBRATION.settleMs + 500)
    expect(result.current.progress).toBeGreaterThan(0)
    send(CALIBRATION.settleMs + 600, true)
    expect(result.current.progress).toBe(0)
    send(60_000)
    expect(result.current.step).toBe('recording')
  })

  it('stops with a reason when interrupted, only while recording', () => {
    const { result, onDone } = setup()
    act(() => result.current.interrupt('camera off'))
    expect(result.current.step).toBe('idle')
    act(() => result.current.start())
    act(() => result.current.interrupt('camera off'))
    expect(result.current.step).toBe('failed')
    expect(result.current.error).toBe('camera off')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('cancel stops without saving', () => {
    const { result, onDone } = setup()
    act(() => result.current.start())
    act(() => result.current.cancel())
    expect(result.current.step).toBe('idle')
    expect(onDone).not.toHaveBeenCalled()
  })
})
