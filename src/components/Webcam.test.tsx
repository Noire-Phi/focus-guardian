// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackerFrame } from '../hooks/useFaceTracker'
import type { CameraStats, Settings } from '../types'
import { alertCue } from '../utils/alerts'
import { poseMatrix } from '../utils/poseMatrix.testutil'
import { DEFAULT_SETTINGS, saveAttentionPrefs } from '../utils/storage'
import { Webcam } from './Webcam'

// The camera card's wiring: when detection runs, how camera time reaches the session, and
// when alerts show. The camera and MediaPipe are faked; the tracker hands us its options, and
// the test plays the frames it would have seen.

type TrackerOptions = {
  active: boolean
  detectObjects: boolean
  detectPose?: boolean
  onFrame: (frame: TrackerFrame) => void
}
const tracker = vi.hoisted(() => ({ options: null as unknown as TrackerOptions }))

vi.mock('../hooks/useWebcam', () => ({
  useWebcam: () => ({ status: 'active', stream: null, error: null, start: vi.fn(), stop: vi.fn() }),
}))
vi.mock('../hooks/useFaceTracker', () => ({
  useFaceTracker: (_ref: unknown, options: TrackerOptions) => {
    tracker.options = options
    return { status: 'ready', objectStatus: 'ready', poseStatus: 'off', retry: vi.fn() }
  },
}))
vi.mock('../utils/alerts', () => ({ alertCue: vi.fn() }))

const ON_SCREEN = { matrix: poseMatrix(0, 0), blendshapes: {} }
const SIDEWAYS = { matrix: poseMatrix(70, 0), blendshapes: {} }

let alertRoot: HTMLDivElement

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  vi.mocked(alertCue).mockClear()
  alertRoot = document.createElement('div')
  document.body.append(alertRoot)
})

afterEach(() => {
  cleanup()
  alertRoot.remove()
  vi.useRealTimers()
})

function setup({ watchAttention = true, settings = DEFAULT_SETTINGS as Settings } = {}) {
  const onCameraStats = vi.fn<(delta: CameraStats) => void>()
  const view = render(
    <Webcam
      watchAttention={watchAttention}
      settings={settings}
      alertRoot={alertRoot}
      onCameraStats={onCameraStats}
    />,
  )
  const rerender = (next: { watchAttention: boolean }) =>
    view.rerender(
      <Webcam
        watchAttention={next.watchAttention}
        settings={settings}
        alertRoot={alertRoot}
        onCameraStats={onCameraStats}
      />,
    )
  return { onCameraStats, rerender }
}

/** Plays camera checks every 200 ms for `ms`, all showing `face`. */
function play(face: TrackerFrame['face'], ms: number) {
  for (let t = 0; t < ms; t += 200) {
    act(() => {
      vi.advanceTimersByTime(200)
      tracker.options.onFrame({ at: Date.now(), hidden: false, face, objects: null, pose: null })
    })
  }
}

describe('Webcam', () => {
  it('runs detection only during a focus session', () => {
    setup({ watchAttention: false })
    expect(tracker.options.active).toBe(false)
    expect(screen.getByText(/focus check runs during a focus session/)).toBeTruthy()
    cleanup()

    setup()
    expect(tracker.options.active).toBe(true)
  })

  it('looks for phones only when the phone check is on', () => {
    setup()
    expect(tracker.options.detectObjects).toBe(true)
    cleanup()
    setup({
      settings: {
        ...DEFAULT_SETTINGS,
        detections: { ...DEFAULT_SETTINGS.detections, phone: false },
      },
    })
    expect(tracker.options.detectObjects).toBe(false)
  })

  it('does nothing when every camera check is off', () => {
    const detections = { lookingAway: false, phone: false, posture: false, tabLeaves: true }
    setup({ settings: { ...DEFAULT_SETTINGS, detections } })
    expect(tracker.options.active).toBe(false)
    expect(screen.getByText(/checks are off in Settings/)).toBeTruthy()
  })

  it('waits for the book position before checking in Book mode', () => {
    saveAttentionPrefs({ studyMode: 'book', calibration: null, posture: null })
    setup()
    expect(tracker.options.active).toBe(false)
    expect(screen.getByText(/Calibrate your book position to use this mode/)).toBeTruthy()
  })

  it('passes camera time on about once a second, and the rest when checking stops', () => {
    const { onCameraStats, rerender } = setup()
    play(ON_SCREEN, 1000)
    expect(onCameraStats).toHaveBeenCalledTimes(1)
    const first = onCameraStats.mock.calls[0][0]
    expect(first.checkedMs).toBeGreaterThan(0)
    expect(first.focusedMs).toBe(first.checkedMs)

    play(ON_SCREEN, 400)
    rerender({ watchAttention: false })
    const total = onCameraStats.mock.calls.reduce((sum, [d]) => sum + d.checkedMs, 0)
    // Every 200 ms between the first and last check counted, none lost when stopping
    expect(total).toBe(1200)
  })

  it('alerts, with sound or flash as set, after 5 seconds of looking away', () => {
    setup()
    play(SIDEWAYS, 4600)
    expect(alertRoot.textContent).toBe('')
    expect(alertCue).not.toHaveBeenCalled()

    play(SIDEWAYS, 800)
    expect(alertRoot.textContent).toMatch(/Eyes back on your work/)
    expect(alertCue).toHaveBeenCalledOnce()
    expect(alertCue).toHaveBeenCalledWith(expect.objectContaining({ sound: true, flash: false }))
    // Screen readers get a steady sentence; the ticking counter is hidden from them
    expect(alertRoot.querySelector('[aria-hidden="true"]')?.textContent).toMatch(/distracted for/)
  })

  it('clears the alert once you are back on task', () => {
    setup()
    play(SIDEWAYS, 5400)
    expect(alertRoot.textContent).toMatch(/Eyes back/)
    play(ON_SCREEN, 1400)
    expect(alertRoot.textContent).toBe('')
  })
})
