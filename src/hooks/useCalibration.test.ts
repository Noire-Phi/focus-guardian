// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CALIBRATION } from '../utils/calibration'
import { poseMatrix } from '../utils/poseMatrix.testutil'
import { useCalibration } from './useCalibration'

const STEP_MS = CALIBRATION.settleMs + CALIBRATION.sampleMs

function setup() {
  const onDone = vi.fn()
  const hook = renderHook(() => useCalibration(onDone))
  /** Sends a frame every 200 ms until one full step is over, starting at `from`. */
  const step = (from: number, yaw: number | null, pitch = 0) => {
    for (let at = from; at < from + STEP_MS + 200; at += 200) {
      act(() =>
        hook.result.current.handleFrame({
          at,
          hidden: false,
          face: yaw === null ? null : { matrix: poseMatrix(yaw, pitch), blendshapes: {} },
          objects: null,
          pose: null,
        }),
      )
    }
    return from + STEP_MS + 400
  }
  return { ...hook, onDone, step }
}

describe('useCalibration', () => {
  it('records the screen, then the book, and saves both', () => {
    const { result, onDone, step } = setup()
    act(() => result.current.start())
    expect(result.current.step).toBe('screen')

    const next = step(0, 2, -5)
    expect(result.current.step).toBe('book')
    step(next, 0, -40)

    expect(result.current.step).toBe('done')
    const saved = onDone.mock.calls[0][0]
    expect(saved.screen.yawDeg).toBeCloseTo(2)
    expect(saved.screen.pitchDeg).toBeCloseTo(-5)
    expect(saved.book.pitchDeg).toBeCloseTo(-40)
  })

  it('shows progress while recording', () => {
    const { result } = setup()
    act(() => result.current.start())
    const frameAt = (at: number) =>
      act(() =>
        result.current.handleFrame({
          at,
          hidden: false,
          face: { matrix: poseMatrix(0, 0), blendshapes: {} },
          objects: null,
          pose: null,
        }),
      )
    frameAt(0)
    expect(result.current.phase).toBe('settle')
    frameAt(CALIBRATION.settleMs + CALIBRATION.sampleMs / 2)
    expect(result.current.phase).toBe('recording')
    expect(result.current.progress).toBeCloseTo(0.5)
  })

  it('can skip the book for screen-only use', () => {
    const { result, onDone, step } = setup()
    act(() => result.current.start())
    step(0, 0, -5)
    act(() => result.current.skipBook())
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ book: null }))
    expect(result.current.step).toBe('done')
  })

  it('fails with a message when no face is seen', () => {
    const { result, onDone, step } = setup()
    act(() => result.current.start())
    step(0, null)
    expect(result.current.step).toBe('failed')
    expect(result.current.error).toMatch(/face/i)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('fails when the book position is too close to the screen', () => {
    const { result, onDone, step } = setup()
    act(() => result.current.start())
    step(step(0, 0, -5), 0, -8)
    expect(result.current.step).toBe('failed')
    expect(result.current.error).toMatch(/too close/)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('cancel stops without saving', () => {
    const { result, onDone, step } = setup()
    act(() => result.current.start())
    step(0, 0, -5)
    act(() => result.current.cancel())
    expect(result.current.step).toBe('idle')
    expect(onDone).not.toHaveBeenCalled()
  })
})
