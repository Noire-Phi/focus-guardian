import type {
  FaceLandmarker,
  FaceLandmarkerResult,
  ObjectDetector,
  ObjectDetectorResult,
} from '@mediapipe/tasks-vision'
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'
import { ATTENTION, type Blendshapes, type Face, type ObjectScores } from '../utils/attention'

// MediaPipe's runtime and models are fetched the first time they're needed, not with the
// app. Only these files are downloaded; video frames never leave your device.
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm'
const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const OBJECT_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite'

// COCO category names in the object detector's model
const BOOK = 'book'
const PHONE = 'cell phone'

type Vision = typeof import('@mediapipe/tasks-vision')

let visionPromise: Promise<{ vision: Vision; fileset: unknown }> | null = null
let facePromise: Promise<FaceLandmarker> | null = null
let objectsPromise: Promise<ObjectDetector> | null = null

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

function loadFaceLandmarker(): Promise<FaceLandmarker> {
  facePromise ??= loadVision()
    .then(({ vision, fileset }) =>
      createTask((delegate) =>
        vision.FaceLandmarker.createFromOptions(fileset as never, {
          baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        }),
      ),
    )
    .catch((err: unknown) => {
      facePromise = null // let a retry try again
      throw err
    })
  return facePromise
}

function loadObjectDetector(): Promise<ObjectDetector> {
  objectsPromise ??= loadVision()
    .then(({ vision, fileset }) =>
      createTask((delegate) =>
        vision.ObjectDetector.createFromOptions(fileset as never, {
          baseOptions: { modelAssetPath: OBJECT_MODEL_URL, delegate },
          runningMode: 'VIDEO',
          // Only the two things we care about, so other objects never show up
          categoryAllowlist: [BOOK, PHONE],
          scoreThreshold: 0.3,
          maxResults: 5,
        }),
      ),
    )
    .catch((err: unknown) => {
      objectsPromise = null
      throw err
    })
  return objectsPromise
}

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

/** One check of the camera. `objects` is null on checks where objects weren't looked for. */
export interface TrackerFrame {
  at: number
  hidden: boolean
  face: Face | null
  objects: ObjectScores | null
}

export type TrackerStatus = 'off' | 'loading' | 'ready' | 'error'

/**
 * Runs MediaPipe on the video while `active`: Face Landmarker every 200 ms and, when
 * `detectObjects` is on, the object detector every second. Each result goes to `onFrame`.
 * The judging (focused or not, calibration) happens in the hooks that receive the frames.
 */
export function useFaceTracker(
  videoRef: RefObject<HTMLVideoElement | null>,
  {
    active,
    detectObjects,
    onFrame,
  }: {
    active: boolean
    detectObjects: boolean
    onFrame: (frame: TrackerFrame) => void
  },
) {
  const [faceModel, setFaceModel] = useState<FaceLandmarker | null>(null)
  const [objectModel, setObjectModel] = useState<ObjectDetector | null>(null)
  const [faceFailed, setFaceFailed] = useState(false)
  const [objectsFailed, setObjectsFailed] = useState(false)
  const objectModelRef = useRef<ObjectDetector | null>(null)

  useEffect(() => {
    if (!active || faceModel || faceFailed) return
    let cancelled = false
    loadFaceLandmarker().then(
      (model) => !cancelled && setFaceModel(model),
      () => !cancelled && setFaceFailed(true),
    )
    return () => {
      cancelled = true
    }
  }, [active, faceModel, faceFailed])

  useEffect(() => {
    if (!active || !detectObjects || objectModel || objectsFailed) return
    let cancelled = false
    loadObjectDetector().then(
      (model) => !cancelled && setObjectModel(model),
      () => !cancelled && setObjectsFailed(true),
    )
    return () => {
      cancelled = true
    }
  }, [active, detectObjects, objectModel, objectsFailed])

  useEffect(() => {
    objectModelRef.current = detectObjects ? objectModel : null
  }, [detectObjects, objectModel])

  const check = useEffectEvent(
    (model: FaceLandmarker, last: { frameTime: number; objectsAt: number }) => {
      if (document.hidden) {
        onFrame({ at: Date.now(), hidden: true, face: null, objects: null })
        return
      }
      const video = videoRef.current
      // No new frame since the last check: nothing to do
      if (!video || video.readyState < 2 || video.currentTime === last.frameTime) return
      last.frameTime = video.currentTime

      const face = toFace(model.detectForVideo(video, performance.now()))
      let objects: ObjectScores | null = null
      const detector = objectModelRef.current
      if (detector && Date.now() - last.objectsAt >= ATTENTION.objectCheckEveryMs) {
        objects = toObjectScores(detector.detectForVideo(video, performance.now()))
        last.objectsAt = Date.now()
      }
      // Timed after detecting, so a slow frame can't make being away seem longer
      onFrame({ at: Date.now(), hidden: false, face, objects })
    },
  )

  // Check a frame every 200 ms. Each check is scheduled after the previous one finishes,
  // so slow frames can never pile up.
  useEffect(() => {
    if (!active || !faceModel) return
    const last = { frameTime: -1, objectsAt: -Infinity }
    let timer: ReturnType<typeof setTimeout>
    const loop = () => {
      check(faceModel, last)
      timer = setTimeout(loop, ATTENTION.checkEveryMs)
    }
    timer = setTimeout(loop, ATTENTION.checkEveryMs)
    return () => clearTimeout(timer)
  }, [active, faceModel])

  const status: TrackerStatus = !active
    ? 'off'
    : faceFailed
      ? 'error'
      : faceModel
        ? 'ready'
        : 'loading'
  const objectStatus: TrackerStatus =
    !active || !detectObjects ? 'off' : objectsFailed ? 'error' : objectModel ? 'ready' : 'loading'

  return {
    status,
    objectStatus,
    retry: () => {
      setFaceFailed(false)
      setObjectsFailed(false)
    },
  }
}
