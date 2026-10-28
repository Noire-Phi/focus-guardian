// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { poseMatrix } from '../utils/poseMatrix.testutil'
import { useAttention } from './useAttention'

// A fake MediaPipe: tests choose what the next detection returns
const mp = vi.hoisted(() => ({
  result: null as unknown,
  detect: vi.fn(),
  create: vi.fn(),
}))

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
  FaceLandmarker: { createFromOptions: mp.create },
}))

const faceResult = (yaw: number) => ({
  faceLandmarks: [[{ x: 0, y: 0, z: 0 }]],
  faceBlendshapes: [{ categories: [] }],
  facialTransformationMatrixes: [{ rows: 4, columns: 4, data: poseMatrix(yaw, 0) }],
})
const LOOKING = faceResult(5)
const TURNED_AWAY = faceResult(60)
const NO_FACE = { faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] }

function makeVideo() {
  const video = document.createElement('video')
  Object.defineProperty(video, 'readyState', { get: () => 4 })
  // A new frame every check: the video's time follows the (fake) clock
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => Date.now() / 1000,
  })
  return video
}

/** Moves the fake clock forward, running checks and resolving the model load. */
async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** Renders the hook and lets the model finish loading. Checks then run every 200 ms. */
async function setup(enabled = true) {
  const onAlert = vi.fn()
  const ref = { current: makeVideo() }
  const hook = renderHook(({ on }) => useAttention(ref, on, onAlert), {
    initialProps: { on: enabled },
  })
  await wait(0)
  // Forget the warm-up detection the first load runs, so tests count only real checks
  mp.detect.mockClear()
  return { ...hook, onAlert, ref }
}

beforeEach(() => {
  vi.useFakeTimers()
  mp.result = LOOKING
  mp.detect.mockReset().mockImplementation(() => mp.result)
  mp.create.mockReset().mockImplementation(async () => ({ detectForVideo: mp.detect }))
})

afterEach(() => {
  vi.useRealTimers()
})

// The loaded model is shared across hook instances, so the loading cases run first
describe('loading', () => {
  it('shows an error if the model cannot load, and can retry', async () => {
    mp.create.mockRejectedValue(new Error('offline'))
    const { result } = await setup()
    expect(result.current.status).toBe('error')

    mp.create.mockReset().mockImplementation(async () => ({ detectForVideo: mp.detect }))
    act(() => result.current.retry())
    await wait(0)
    expect(result.current.status).toBe('watching')
    // The slow first detection runs during loading, before any real check
    expect(mp.detect).toHaveBeenCalledTimes(1)
  })
})

// After setup, the first check runs at 200 ms and then every 200 ms
describe('useAttention', () => {
  it('is off and checks nothing while disabled', async () => {
    const { result } = await setup(false)
    await wait(2000)
    expect(result.current.status).toBe('off')
    expect(mp.detect).not.toHaveBeenCalled()
  })

  it('checks about 5 frames a second', async () => {
    await setup()
    await wait(1000)
    expect(mp.detect).toHaveBeenCalledTimes(5)
  })

  it('skips a check when the video has no new frame', async () => {
    const { ref } = await setup()
    Object.defineProperty(ref.current, 'currentTime', { get: () => 1 })
    await wait(1000)
    expect(mp.detect).toHaveBeenCalledTimes(1)
  })

  it('alerts once after 5 seconds of looking away, not before', async () => {
    const { result, onAlert } = await setup()
    await wait(200)
    expect(result.current.gaze).toBe('looking')

    // Looking away from the next check (400 ms) on
    mp.result = TURNED_AWAY
    await wait(4800) // 4.6 s away
    expect(result.current.gaze).toBe('away')
    expect(result.current.alerting).toBe(false)
    expect(onAlert).not.toHaveBeenCalled()

    await wait(400) // 5 s away
    expect(result.current.alerting).toBe(true)
    expect(result.current.awayMs).toBe(5000)
    expect(onAlert).toHaveBeenCalledTimes(1)

    // Staying away doesn't alert again
    await wait(5000)
    expect(onAlert).toHaveBeenCalledTimes(1)
  })

  it('treats no face as looking away', async () => {
    const { result, onAlert } = await setup()
    mp.result = NO_FACE
    await wait(5200)
    expect(result.current.gaze).toBe('no-face')
    expect(onAlert).toHaveBeenCalledTimes(1)
  })

  it('clears the alert after looking back for a second, and can alert again', async () => {
    const { result, onAlert } = await setup()
    mp.result = TURNED_AWAY
    await wait(5200)
    expect(result.current.alerting).toBe(true)

    mp.result = LOOKING
    await wait(600)
    expect(result.current.alerting).toBe(true)
    await wait(600)
    expect(result.current.alerting).toBe(false)

    mp.result = TURNED_AWAY
    await wait(5200)
    expect(onAlert).toHaveBeenCalledTimes(2)
  })

  it('pauses while the tab is hidden and starts fresh after', async () => {
    const { result, onAlert } = await setup()
    mp.result = TURNED_AWAY
    await wait(3000)

    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    await wait(10_000)
    expect(onAlert).not.toHaveBeenCalled()
    expect(result.current.awayMs).toBe(0)

    hidden.mockReturnValue(false)
    await wait(4000)
    expect(result.current.alerting).toBe(false)
    await wait(1200)
    expect(onAlert).toHaveBeenCalledTimes(1)
    hidden.mockRestore()
  })

  it('stops checking and resets when disabled', async () => {
    const { result, rerender } = await setup()
    mp.result = TURNED_AWAY
    await wait(5200)
    expect(result.current.alerting).toBe(true)

    rerender({ on: false })
    const calls = mp.detect.mock.calls.length
    await wait(2000)
    expect(mp.detect.mock.calls.length).toBe(calls)
    expect(result.current).toMatchObject({ status: 'off', alerting: false, awayMs: 0 })
  })
})
