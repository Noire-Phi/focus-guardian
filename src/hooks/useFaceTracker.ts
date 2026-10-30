import type {
  FaceLandmarker,
  FaceLandmarkerResult,
  ObjectDetector,
  ObjectDetectorResult,
  PoseLandmarker,
} from '@mediapipe/tasks-vision'
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'
import { ATTENTION, type Blendshapes, type Face, type ObjectScores } from '../utils/attention'
import { nextCheckDelay, pickExtraCheck } from '../utils/detectionSchedule'
import { countEvent, recordTiming } from '../utils/perfStats'
import { POSTURE, type Landmark } from '../utils/posture'
import { usePageVisible } from './usePageVisible'

// MediaPipe's runtime and models are fetched the first time they're needed, not with the
// app. Only these files are downloaded; video frames never leave your device.
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm'
const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const OBJECT_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite'
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

// COCO category names in the object detector's model
const BOOK = 'book'
const PHONE = 'cell phone'

type Vision = typeof import('@mediapipe/tasks-vision')

let visionPromise: Promise<{ vision: Vision; fileset: unknown }> | null = null
let facePromise: Promise<FaceLandmarker> | null = null
let objectsPromise: Promise<ObjectDetector> | null = null
let posePromise: Promise<PoseLandmarker> | null = null

/** Forgets the loaded models. Only for tests, so each test can load from scratch. */
export function resetModelsForTests() {
  visionPromise = null
  facePromise = null
  objectsPromise = null
  posePromise = null
}

function loadVision() {
  visionPromise ??= (async () => {
    // Imported here so the library isn't part of the app's first load
    const vision = await import('@mediapipe/tasks-vision')
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL)
    return { vision, fileset }
  })().catch((err: unknown) => {
    visionPromise = null
    throw err
  })
  return visionPromise
}

/** Tries the GPU first, then the CPU. Runs one detection up front: the first is slow. */
async function createTask<
  T extends { detectForVideo(frame: HTMLCanvasElement, ts: number): unknown },
>(create: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
  let task: T
  try {
    task = await create('GPU')
  } catch {
    task = await create('CPU')
  }
  const blank = document.createElement('canvas')
  blank.width = blank.height = 64
  task.detectForVideo(blank, performance.now())
  return task
}

/** Loads a model once and shares it; a failed load is forgotten so a retry can try again. */
function cached<T>(
  get: () => Promise<T> | null,
  set: (p: Promise<T> | null) => void,
  load: (vision: Vision, fileset: never) => Promise<T>,
): Promise<T> {
  const existing = get()
  if (existing) return existing
  const promise = loadVision()
    .then(({ vision, fileset }) => load(vision, fileset as never))
    .catch((err: unknown) => {
      set(null)
      throw err
    })
  set(promise)
  return promise
}

const loadFaceLandmarker = () =>
  cached(
    () => facePromise,
    (p) => (facePromise = p),
    (vision, fileset) =>
      createTask((delegate) =>
        vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        }),
      ),
  )

const loadObjectDetector = () =>
  cached(
    () => objectsPromise,
    (p) => (objectsPromise = p),
    (vision, fileset) =>
      createTask((delegate) =>
        vision.ObjectDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: OBJECT_MODEL_URL, delegate },
          runningMode: 'VIDEO',
          // Only the two things we care about, so other objects never show up
          categoryAllowlist: [BOOK, PHONE],
          scoreThreshold: 0.3,
          maxResults: 5,
        }),
      ),
  )

const loadPoseLandmarker = () =>
  cached(
    () => posePromise,
    (p) => (posePromise = p),
    (vision, fileset) =>
      createTask((delegate) =>
        vision.PoseLandmarker.createFromOptions(fileset, {
          // The "lite" model: plenty for head and shoulders, and the fastest
          baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
        }),
      ),
  )

function toFace(result: FaceLandmarkerResult): Face | null {
  if (result.faceLandmarks.length === 0) return null
  const blendshapes: Blendshapes = {}
  for (const c of result.faceBlendshapes?.[0]?.categories ?? []) {
    blendshapes[c.categoryName] = c.score
  }
  return { matrix: result.facialTransformationMatrixes?.[0]?.data ?? null, blendshapes }
}

function toObjectScores(result: ObjectDetectorResult): ObjectScores {
  const scores: ObjectScores = { book: 0, phone: 0 }
  for (const detection of result.detections) {
    for (const c of detection.categories) {
      if (c.categoryName === BOOK) scores.book = Math.max(scores.book, c.score)
      if (c.categoryName === PHONE) scores.phone = Math.max(scores.phone, c.score)
    }
  }
  return scores
}

/**
 * One check of the camera. `objects` and `pose` are null on checks where they weren't
 * looked for; `pose.landmarks` is null when they were but no person was found.
 */
export interface TrackerFrame {
  at: number
  hidden: boolean
  face: Face | null
  objects: ObjectScores | null
  pose: { landmarks: Landmark[] | null } | null
}

export type TrackerStatus = 'off' | 'loading' | 'ready' | 'error'

/** Loads a model when `active` and `wanted`, and reports its status. */
function useOptionalModel<T>(active: boolean, wanted: boolean, load: () => Promise<T>) {
  const [model, setModel] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!active || !wanted || model || failed) return
    let cancelled = false
    load().then(
      (loaded) => !cancelled && setModel(() => loaded),
      () => !cancelled && setFailed(true),
    )
    return () => {
      cancelled = true
    }
  }, [active, wanted, model, failed, load])

  const status: TrackerStatus =
    !active || !wanted ? 'off' : failed ? 'error' : model ? 'ready' : 'loading'
  return {
    model: wanted ? model : null,
    status,
    // Loaded, failed, or not needed: either way, nothing to wait for
    settled: !wanted || model !== null || failed,
    retry: () => setFailed(false),
  }
}

/**
 * Runs MediaPipe on the video while `active` and the tab is visible: Face Landmarker every
 * 200 ms; when `detectObjects` is on, the object detector about every 500 ms; when
 * `detectPose` is on, Pose Landmarker about every 500 ms, never both on the same check.
 * Slow checks push the next one back (utils/detectionSchedule.ts). Each result goes to
 * `onFrame`. The judging (focused or not, posture, calibration) happens in the hooks that
 * receive the frames.
 */
export function useFaceTracker(
  videoRef: RefObject<HTMLVideoElement | null>,
  {
    active,
    detectObjects,
    detectPose = false,
    onFrame,
  }: {
    active: boolean
    detectObjects: boolean
    detectPose?: boolean
    onFrame: (frame: TrackerFrame) => void
  },
) {
  const visible = usePageVisible()
  const face = useOptionalModel(active, true, loadFaceLandmarker)
  const objects = useOptionalModel(active, detectObjects, loadObjectDetector)
  const pose = useOptionalModel(active, detectPose, loadPoseLandmarker)

  // The loop reads the optional models through refs, so turning one on or off doesn't
  // restart it
  const objectModelRef = useRef<ObjectDetector | null>(null)
  const poseModelRef = useRef<PoseLandmarker | null>(null)
  useEffect(() => {
    objectModelRef.current = objects.model
    poseModelRef.current = pose.model
  }, [objects.model, pose.model])

  const check = useEffectEvent(
    (model: FaceLandmarker, last: { frameTime: number; objectsAt: number; poseAt: number }) => {
      // The loop stops when the tab is hidden; this covers the moment before it does
      if (document.hidden) return
      const video = videoRef.current
      // No new frame since the last check: nothing to do
      if (!video || video.readyState < 2 || video.currentTime === last.frameTime) return
      last.frameTime = video.currentTime

      const started = performance.now()
      const faceResult = toFace(model.detectForVideo(video, started))
      recordTiming('face', performance.now() - started)

      const detector = objectModelRef.current
      const poser = poseModelRef.current
      const extra = pickExtraCheck(
        Date.now(),
        { lastAt: last.objectsAt, everyMs: ATTENTION.objectCheckEveryMs, wanted: !!detector },
        { lastAt: last.poseAt, everyMs: POSTURE.checkEveryMs, wanted: !!poser },
      )

      let objectScores: ObjectScores | null = null
      if (detector && extra === 'objects') {
        const t = performance.now()
        objectScores = toObjectScores(detector.detectForVideo(video, t))
        recordTiming('objects', performance.now() - t)
        last.objectsAt = Date.now()
      }

      let poseResult: TrackerFrame['pose'] = null
      if (poser && extra === 'pose') {
        const t = performance.now()
        const result = poser.detectForVideo(video, t)
        recordTiming('pose', performance.now() - t)
        poseResult = { landmarks: result.landmarks[0] ?? null }
        last.poseAt = Date.now()
      }

      recordTiming('check', performance.now() - started)

      // Timed after detecting, so a slow frame can't make being away seem longer
      onFrame({
        at: Date.now(),
        hidden: false,
        face: faceResult,
        objects: objectScores,
        pose: poseResult,
      })
    },
  )

  // Wait for every model that's wanted (or for it to fail), so their slow first runs
  // happen while "Loading" shows, not after checking has started
  const ready = face.model !== null && objects.settled && pose.settled
  const faceModel = face.model

  // One "hidden" frame when the tab is hidden, so the checks reset instead of counting the
  // time away (the tab guard counts that)
  const reportHidden = useEffectEvent(() => {
    countEvent('hiddenPause')
    onFrame({ at: Date.now(), hidden: true, face: null, objects: null, pose: null })
  })

  // Check a frame every 200 ms, or less often if checks are slow on this computer. Each check
  // is scheduled after the previous one finishes, so slow frames can never pile up. Nothing
  // runs while the tab is hidden: there's nothing to see, and it would only use battery.
  useEffect(() => {
    if (!active || !ready || !faceModel) return
    if (!visible) {
      reportHidden()
      return
    }
    const last = { frameTime: -1, objectsAt: -Infinity, poseAt: -Infinity }
    let timer: ReturnType<typeof setTimeout>
    const loop = () => {
      const started = performance.now()
      check(faceModel, last)
      timer = setTimeout(loop, nextCheckDelay(performance.now() - started, ATTENTION.checkEveryMs))
    }
    timer = setTimeout(loop, ATTENTION.checkEveryMs)
    return () => clearTimeout(timer)
  }, [active, ready, faceModel, visible])

  const status: TrackerStatus = !active
    ? 'off'
    : face.status === 'error'
      ? 'error'
      : ready
        ? 'ready'
        : 'loading'

  return {
    status,
    objectStatus: objects.status,
    poseStatus: pose.status,
    retry: () => {
      face.retry()
      objects.retry()
      pose.retry()
    },
  }
}
