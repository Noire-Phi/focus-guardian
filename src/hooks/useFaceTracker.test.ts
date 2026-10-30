// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { poseMatrix } from '../utils/poseMatrix.testutil'
import { resetModelsForTests, useFaceTracker, type TrackerFrame } from './useFaceTracker'

// A fake MediaPipe: tests choose what each detector returns
const mp = vi.hoisted(() => ({
  face: null as unknown,
  objects: null as unknown,
  detectFace: vi.fn(),
  detectObjects: vi.fn(),
  createFace: vi.fn(),
  createObjects: vi.fn(),
  pose: null as unknown,
  detectPose: vi.fn(),
  createPose: vi.fn(),
}))

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
  FaceLandmarker: { createFromOptions: mp.createFace },
  ObjectDetector: { createFromOptions: mp.createObjects },
  PoseLandmarker: { createFromOptions: mp.createPose },
}))

const FACE = {
  faceLandmarks: [[{ x: 0, y: 0, z: 0 }]],
  faceBlendshapes: [{ categories: [{ categoryName: 'eyeLookOutLeft', score: 0.1 }] }],
  facialTransformationMatrixes: [{ rows: 4, columns: 4, data: poseMatrix(10, -5) }],
}
const NO_FACE = { faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] }
const PHONE_AND_BOOK = {
  detections: [
    { categories: [{ categoryName: 'cell phone', score: 0.8 }], keypoints: [] },
    { categories: [{ categoryName: 'book', score: 0.6 }], keypoints: [] },
  ],
}

const PERSON = { landmarks: [[{ x: 0.5, y: 0.4, z: 0, visibility: 0.9 }]], worldLandmarks: [] }
const NOBODY = { landmarks: [], worldLandmarks: [] }

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

/** Hides or shows the tab, as switching tabs or minimising the window does. */
function setVisible(visible: boolean) {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(!visible)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(visible ? 'visible' : 'hidden')
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** Renders the hook and lets the models finish loading. Checks then run every 200 ms. */
async function setup({ active = true, detectObjects = false, detectPose = false } = {}) {
  const frames: TrackerFrame[] = []
  const ref = { current: makeVideo() }
  const hook = renderHook(
    (props: { active: boolean; detectObjects: boolean; detectPose?: boolean }) =>
      useFaceTracker(ref, { ...props, onFrame: (f) => frames.push(f) }),
    { initialProps: { active, detectObjects, detectPose } },
  )
  await wait(0)
  // Forget the warm-up detections that loading runs, so tests count only real checks
  mp.detectFace.mockClear()
  mp.detectObjects.mockClear()
  mp.detectPose.mockClear()
  return { ...hook, frames, ref }
}

beforeEach(() => {
  vi.useFakeTimers()
  resetModelsForTests()
  mp.face = FACE
  mp.objects = PHONE_AND_BOOK
  mp.detectFace.mockReset().mockImplementation(() => mp.face)
  mp.detectObjects.mockReset().mockImplementation(() => mp.objects)
  mp.createFace.mockReset().mockImplementation(async () => ({ detectForVideo: mp.detectFace }))
  mp.createObjects
    .mockReset()
    .mockImplementation(async () => ({ detectForVideo: mp.detectObjects }))
  mp.pose = PERSON
  mp.detectPose.mockReset().mockImplementation(() => mp.pose)
  mp.createPose.mockReset().mockImplementation(async () => ({ detectForVideo: mp.detectPose }))
})

afterEach(() => {
  // Unmount every hook, so no test's loop is still listening when the next one runs
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('loading', () => {
  it('shows an error if face detection cannot load, and can retry', async () => {
    mp.createFace.mockRejectedValue(new Error('offline'))
    const { result } = await setup()
    expect(result.current.status).toBe('error')

    mp.createFace.mockReset().mockImplementation(async () => ({ detectForVideo: mp.detectFace }))
    act(() => result.current.retry())
    await wait(0)
    expect(result.current.status).toBe('ready')
    // The slow first detection runs during loading, before any real check
    expect(mp.detectFace).toHaveBeenCalledTimes(1)
  })

  it('keeps face checks running if only the object detector fails', async () => {
    mp.createObjects.mockRejectedValue(new Error('offline'))
    const { result, frames } = await setup({ detectObjects: true })
    expect(result.current.status).toBe('ready')
    expect(result.current.objectStatus).toBe('error')
    await wait(400)
    expect(frames).toHaveLength(2)
    expect(frames.every((f) => f.objects === null)).toBe(true)
  })

  it('waits for the object detector before checking, so its slow start happens while loading', async () => {
    let finishLoading: () => void = () => {}
    mp.createObjects.mockReset().mockImplementation(
      () =>
        new Promise((resolve) => {
          finishLoading = () => resolve({ detectForVideo: mp.detectObjects })
        }),
    )
    const { result, frames } = await setup({ detectObjects: true })
    await wait(1000)
    expect(result.current.status).toBe('loading')
    expect(frames).toHaveLength(0)

    finishLoading()
    await wait(0)
    expect(result.current.status).toBe('ready')
    await wait(400)
    expect(frames).toHaveLength(2)
  })

  it('tries the CPU when the GPU is not available', async () => {
    mp.createObjects
      .mockReset()
      .mockRejectedValueOnce(new Error('no GPU'))
      .mockImplementation(async () => ({ detectForVideo: mp.detectObjects }))
    const { result } = await setup({ detectObjects: true })
    expect(result.current.objectStatus).toBe('ready')
    const delegates = mp.createObjects.mock.calls.map((c) => c[1].baseOptions.delegate)
    expect(delegates).toEqual(['GPU', 'CPU'])
  })
})

// After setup, the first check runs at 200 ms and then every 200 ms
describe('useFaceTracker', () => {
  it('does nothing while inactive', async () => {
    const { result, frames } = await setup({ active: false })
    await wait(2000)
    expect(result.current.status).toBe('off')
    expect(frames).toHaveLength(0)
  })

  it('checks the face about 5 times a second and reports what it sees', async () => {
    const { frames } = await setup()
    await wait(1000)
    expect(mp.detectFace).toHaveBeenCalledTimes(5)
    expect(frames).toHaveLength(5)
    expect(frames[0].hidden).toBe(false)
    expect(frames[0].face?.blendshapes).toEqual({ eyeLookOutLeft: 0.1 })
    expect(frames[0].face?.matrix).toHaveLength(16)

    mp.face = NO_FACE
    await wait(200)
    expect(frames.at(-1)?.face).toBeNull()
  })

  it('skips a check when the video has no new frame', async () => {
    const { ref, frames } = await setup()
    Object.defineProperty(ref.current, 'currentTime', { get: () => 1 })
    await wait(1000)
    expect(frames).toHaveLength(1)
  })

  it('looks for objects only when asked, and then at most every 500 ms', async () => {
    const off = await setup()
    await wait(1000)
    expect(mp.detectObjects).not.toHaveBeenCalled()
    expect(off.frames.every((f) => f.objects === null)).toBe(true)
    off.unmount()

    const on = await setup({ detectObjects: true })
    await wait(2000)
    expect(mp.detectFace).toHaveBeenCalledTimes(10)
    // On the face checks at 200, 800, 1400 and 2000 ms
    expect(mp.detectObjects).toHaveBeenCalledTimes(4)
    expect(on.frames.find((f) => f.objects)?.objects).toEqual({ phone: 0.8, book: 0.6 })
  })

  it('checks posture only when asked, at most every 500 ms', async () => {
    const off = await setup()
    await wait(1000)
    expect(mp.createPose).not.toHaveBeenCalled()
    expect(off.frames.every((f) => f.pose === null)).toBe(true)
    off.unmount()

    const on = await setup({ detectPose: true })
    expect(on.result.current.poseStatus).toBe('ready')
    await wait(2000)
    // On the face checks at 200, 800, 1400 and 2000 ms
    expect(mp.detectPose).toHaveBeenCalledTimes(4)
    expect(on.frames.find((f) => f.pose)?.pose?.landmarks).toHaveLength(1)

    mp.pose = NOBODY
    await wait(600)
    expect(on.frames.filter((f) => f.pose).at(-1)?.pose).toEqual({ landmarks: null })
  })

  it('keeps face checks running if the pose model fails to load', async () => {
    mp.createPose.mockRejectedValue(new Error('offline'))
    const { result, frames } = await setup({ detectPose: true })
    expect(result.current.status).toBe('ready')
    expect(result.current.poseStatus).toBe('error')
    await wait(400)
    expect(frames).toHaveLength(2)
  })

  it('never runs the object detector and Pose on the same check', async () => {
    const { frames } = await setup({ detectObjects: true, detectPose: true })
    await wait(3000)
    expect(mp.detectFace).toHaveBeenCalledTimes(15)
    expect(frames.some((f) => f.objects && f.pose)).toBe(false)
    // Each still runs about every 600 ms
    expect(mp.detectObjects).toHaveBeenCalledTimes(5)
    expect(mp.detectPose).toHaveBeenCalledTimes(5)
  })

  it('stops completely while the tab is hidden, and starts again when it is back', async () => {
    const { frames } = await setup()
    await wait(400)
    expect(frames).toHaveLength(2)

    setVisible(false)
    await wait(5000)
    // One "hidden" frame so the checks reset, then nothing at all: no detection, no wake-ups
    expect(frames).toHaveLength(3)
    expect(frames[2].hidden).toBe(true)
    expect(mp.detectFace).toHaveBeenCalledTimes(2)

    setVisible(true)
    await wait(1000)
    expect(mp.detectFace).toHaveBeenCalledTimes(7)
    expect(frames.at(-1)?.hidden).toBe(false)
  })

  it('stops checking when made inactive', async () => {
    const { frames, rerender } = await setup()
    await wait(600)
    rerender({ active: false, detectObjects: false, detectPose: false })
    const count = frames.length
    await wait(2000)
    expect(frames).toHaveLength(count)
  })
})
