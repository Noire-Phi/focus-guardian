// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Calibration, ObjectScores, StudyMode } from '../utils/attention'
import { poseMatrix } from '../utils/poseMatrix.testutil'
import { useAttention } from './useAttention'
import type { TrackerFrame } from './useFaceTracker'

const calibration: Calibration = {
  screen: { yawDeg: 0, pitchDeg: -5 },
  book: { yawDeg: 0, pitchDeg: -40 },
}

const frame = (
  at: number,
  yaw: number | null,
  pitch = -5,
  objects: ObjectScores | null = null,
) => ({
  at,
  hidden: false,
  face: yaw === null ? null : { matrix: poseMatrix(yaw, pitch), blendshapes: {} },
  objects,
})
const AT_SCREEN = (at: number) => frame(at, 0, -5)
const AT_BOOK = (at: number) => frame(at, 0, -40)
const SIDEWAYS = (at: number) => frame(at, 50, -5)

function setup(mode: StudyMode = 'screen', watching = true) {
  const onAlert = vi.fn()
  const hook = renderHook(
    (props: { watching: boolean; mode: StudyMode }) =>
      useAttention({ ...props, calibration, onAlert }),
    { initialProps: { watching, mode } },
  )
  /** Sends frames every 200 ms from `from` for `ms`, made by `make`. */
  const feed = (make: (at: number) => TrackerFrame, from: number, ms: number) => {
    for (let at = from; at <= from + ms; at += 200) {
      act(() => hook.result.current.handleFrame(make(at)))
    }
  }
  return { ...hook, onAlert, feed }
}

describe('useAttention', () => {
  it('ignores frames and shows nothing while not watching', () => {
    const { result, feed, onAlert } = setup('screen', false)
    feed(SIDEWAYS, 0, 10_000)
    expect(result.current).toMatchObject({ reading: null, alerting: false, awayMs: 0 })
    expect(onAlert).not.toHaveBeenCalled()
  })

  it('alerts once after 5 seconds of being distracted, not before', () => {
    const { result, feed, onAlert } = setup()
    feed(AT_SCREEN, 0, 1000)
    expect(result.current.reading?.reason).toBe('on-screen')

    feed(SIDEWAYS, 1200, 4800)
    expect(result.current.reading?.reason).toBe('sideways')
    expect(result.current.alerting).toBe(false)

    feed(SIDEWAYS, 6200, 0)
    expect(result.current.alerting).toBe(true)
    expect(result.current.awayMs).toBe(5000)
    feed(SIDEWAYS, 6400, 5000)
    expect(onAlert).toHaveBeenCalledTimes(1)
  })

  it('in Book mode, looking down at the book is focused for as long as you like', () => {
    const { result, feed, onAlert } = setup('book')
    feed(AT_BOOK, 0, 20_000)
    expect(result.current.reading?.reason).toBe('on-book')
    expect(onAlert).not.toHaveBeenCalled()
  })

  it('in Book mode, a phone sighting makes it distracted for the next 2 seconds', () => {
    const { result, feed } = setup('book')
    act(() => result.current.handleFrame(frame(0, 0, -40, { phone: 0.9, book: 0 })))
    expect(result.current.reading?.reason).toBe('phone')
    feed(AT_BOOK, 200, 1800)
    expect(result.current.reading?.reason).toBe('phone')
    feed(AT_BOOK, 2200, 0)
    expect(result.current.reading?.reason).toBe('on-book')
  })

  it('reports when a book is in view', () => {
    const { result } = setup('book')
    act(() => result.current.handleFrame(frame(0, 0, -40, { phone: 0, book: 0.7 })))
    expect(result.current.bookSeen).toBe(true)
  })

  it('starts fresh after a hidden tab', () => {
    const { result, feed, onAlert } = setup()
    feed(SIDEWAYS, 0, 4000)
    act(() => result.current.handleFrame({ at: 4200, hidden: true, face: null, objects: null }))
    expect(result.current.awayMs).toBe(0)
    feed(SIDEWAYS, 4400, 4000)
    expect(onAlert).not.toHaveBeenCalled()
  })

  it('starts fresh when the mode changes', () => {
    const { result, feed, rerender } = setup('screen')
    feed(SIDEWAYS, 0, 4000)
    rerender({ watching: true, mode: 'mixed' })
    expect(result.current.reading).toBeNull()
    feed(SIDEWAYS, 4200, 2000)
    expect(result.current.alerting).toBe(false)
  })

  it('treats no face as distracted', () => {
    const { result, feed, onAlert } = setup()
    feed((at) => frame(at, null), 0, 5000)
    expect(result.current.reading?.reason).toBe('no-face')
    expect(onAlert).toHaveBeenCalledTimes(1)
  })
})
