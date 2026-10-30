// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MAX_CHECK_GAP_MS } from '../utils/detectionSchedule'
import { ATTENTION, type Calibration, type ObjectScores, type StudyMode } from '../utils/attention'
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
  pose: null,
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

  describe('phones', () => {
    // Each of these frames carries an object check, like every 500 ms in the app
    const phone = (score: number) => (at: number) => frame(at, 0, -40, { phone: score, book: 0 })

    it('alerts as soon as a phone is seen in 3 checks in a row, not before', () => {
      const { result, feed, onAlert } = setup('book')
      feed(phone(0.9), 0, 400) // frames at 0, 200 and 400: the third confirms it
      expect(result.current.reading?.reason).toBe('phone')
      expect(result.current.phoneConfirmed).toBe(true)
      expect(result.current.alerting).toBe(true)
      expect(onAlert).toHaveBeenCalledTimes(1)
    })

    it('does not alert on 2 checks, or when the streak is broken', () => {
      const { result, feed, onAlert } = setup('book')
      feed(phone(0.9), 0, 200)
      expect(result.current.reading?.reason).toBe('on-book')
      feed(phone(0.1), 400, 0)
      feed(phone(0.9), 600, 200)
      expect(result.current.phoneConfirmed).toBe(false)
      expect(onAlert).not.toHaveBeenCalled()
    })

    it('ignores detections below the confidence threshold', () => {
      const { result, feed, onAlert } = setup('book')
      feed(phone(0.4), 0, 2000)
      expect(result.current.reading?.reason).toBe('on-book')
      expect(onAlert).not.toHaveBeenCalled()
    })

    it('works in Screen mode too', () => {
      const { result, feed, onAlert } = setup('screen')
      feed((at) => frame(at, 0, -5, { phone: 0.8, book: 0 }), 0, 400)
      expect(result.current.reading?.reason).toBe('phone')
      expect(onAlert).toHaveBeenCalledTimes(1)
    })

    it('clears once the phone is gone and you are back on task, then can alert again', () => {
      const { result, feed, onAlert } = setup('book')
      feed(phone(0.9), 0, 400)
      expect(onAlert).toHaveBeenCalledTimes(1)

      feed(phone(0), 600, 200) // 2 checks without the phone
      expect(result.current.phoneConfirmed).toBe(false)
      expect(result.current.reading?.reason).toBe('on-book')
      expect(result.current.alerting).toBe(true) // still confirming you're back
      feed(phone(0), 1000, 1000)
      expect(result.current.alerting).toBe(false)

      feed(phone(0.9), 2200, 400)
      expect(onAlert).toHaveBeenCalledTimes(2)
    })

    it('does not chime again when the 5 seconds pass after a phone alert', () => {
      const { feed, onAlert } = setup('book')
      feed(phone(0.9), 0, 400)
      feed(SIDEWAYS, 600, 8000)
      expect(onAlert).toHaveBeenCalledTimes(1)
    })
  })

  it('reports when a book is in view', () => {
    const { result } = setup('book')
    act(() => result.current.handleFrame(frame(0, 0, -40, { phone: 0, book: 0.7 })))
    expect(result.current.bookSeen).toBe(true)
  })

  it('starts fresh after a hidden tab', () => {
    const { result, feed, onAlert } = setup()
    feed(SIDEWAYS, 0, 4000)
    act(() =>
      result.current.handleFrame({ at: 4200, hidden: true, face: null, objects: null, pose: null }),
    )
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

  it('reports the time each check stands for, for the focus score', () => {
    const onMeasure = vi.fn()
    const { result } = renderHook(() =>
      useAttention({ watching: true, mode: 'book', calibration, onAlert: vi.fn(), onMeasure }),
    )
    const send = (f: TrackerFrame) => act(() => result.current.handleFrame(f))
    send(AT_BOOK(0)) // first check: nothing to measure yet
    send(AT_BOOK(200))
    send(SIDEWAYS(400))
    send(AT_BOOK(5000)) // a long gap is capped at 2.5 s
    const total = onMeasure.mock.calls.reduce(
      (sum, [d]) => ({
        checkedMs: sum.checkedMs + d.checkedMs,
        focusedMs: sum.focusedMs + d.focusedMs,
        phoneMs: sum.phoneMs + d.phoneMs,
      }),
      { checkedMs: 0, focusedMs: 0, phoneMs: 0 },
    )
    expect(total).toEqual({
      checkedMs: 400 + MAX_CHECK_GAP_MS,
      focusedMs: 200 + MAX_CHECK_GAP_MS,
      phoneMs: 0,
    })
  })

  it('counts phone time once a phone is confirmed', () => {
    const onMeasure = vi.fn()
    const { result } = renderHook(() =>
      useAttention({ watching: true, mode: 'book', calibration, onAlert: vi.fn(), onMeasure }),
    )
    for (let at = 0; at <= 800; at += 200) {
      act(() => result.current.handleFrame(frame(at, 0, -40, { phone: 0.9, book: 0 })))
    }
    // Confirmed on the 3rd check (400 ms); 400, 600 and 800 count as phone time
    const phoneMs = onMeasure.mock.calls.reduce((sum, [d]) => sum + d.phoneMs, 0)
    expect(phoneMs).toBe(600)
  })

  describe('settings switches', () => {
    const run = (checkGaze: boolean, checkPhone: boolean) => {
      const onAlert = vi.fn()
      const onMeasure = vi.fn()
      const { result } = renderHook(() =>
        useAttention({
          watching: true,
          mode: 'screen',
          calibration,
          onAlert,
          onMeasure,
          checkGaze,
          checkPhone,
        }),
      )
      return { result, onAlert, onMeasure }
    }

    it('with looking away off, turning sideways is not flagged, but a phone still is', () => {
      const { result, onAlert, onMeasure } = run(false, true)
      for (let at = 0; at <= 8000; at += 200) act(() => result.current.handleFrame(SIDEWAYS(at)))
      expect(result.current.reading?.reason).toBe('unchecked')
      expect(onAlert).not.toHaveBeenCalled()

      for (let at = 8200; at <= 8600; at += 200) {
        act(() => result.current.handleFrame(frame(at, 50, -5, { phone: 0.9, book: 0 })))
      }
      expect(result.current.reading?.reason).toBe('phone')
      expect(onAlert).toHaveBeenCalledTimes(1)
      // No "on task" information, so nothing is recorded for the focus score
      expect(onMeasure).not.toHaveBeenCalled()
    })

    it('with the phone check off, phone detections are ignored', () => {
      const { result, onAlert } = run(true, false)
      for (let at = 0; at <= 1000; at += 200) {
        act(() => result.current.handleFrame(frame(at, 0, -5, { phone: 0.9, book: 0 })))
      }
      expect(result.current.reading?.reason).toBe('on-screen')
      expect(result.current.phoneConfirmed).toBe(false)
      expect(onAlert).not.toHaveBeenCalled()
    })

    it('uses the sensitivity rules it is given', () => {
      const onAlert = vi.fn()
      const rules = { ...ATTENTION, alertAfterMs: 3000 }
      const { result } = renderHook(() =>
        useAttention({ watching: true, mode: 'screen', calibration, onAlert, rules }),
      )
      for (let at = 0; at <= 3000; at += 200) act(() => result.current.handleFrame(SIDEWAYS(at)))
      expect(onAlert).toHaveBeenCalledTimes(1)
    })
  })

  it('treats no face as distracted', () => {
    const { result, feed, onAlert } = setup()
    feed((at) => frame(at, null), 0, 5000)
    expect(result.current.reading?.reason).toBe('no-face')
    expect(onAlert).toHaveBeenCalledTimes(1)
  })
})
