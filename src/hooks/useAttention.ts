import type { FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'
import {
  ATTENTION,
  ATTENTIVE,
  awayForMs,
  readFace,
  updateAttention,
  type AttentionState,
  type Blendshapes,
  type Gaze,
} from '../utils/attention'

// MediaPipe's runtime and model are fetched the first time detection starts, not with the
// app. Only these files are downloaded; video frames never leave your device.
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

let landmarkerPromise: Promise<FaceLandmarker> | null = null

/** Loads Face Landmarker once and shares it. Tries the GPU first, then falls back to the CPU. */
function loadLandmarker(): Promise<FaceLandmarker> {
  landmarkerPromise ??= (async () => {
    // Imported here so the ~MB library isn't part of the app's first load
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL)
    const create = (delegate: 'GPU' | 'CPU') =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      })
    let landmarker: FaceLandmarker
    try {
      landmarker = await create('GPU')
    } catch {
      landmarker = await create('CPU')
    }
    // The first detection is slow (it sets up the GPU, which can block the page for a
    // second or more). Do it now, while "Loading" shows, not in the middle of a session.
    const blank = document.createElement('canvas')
    blank.width = blank.height = 64
    landmarker.detectForVideo(blank, performance.now())
    return landmarker
  })().catch((err: unknown) => {
    landmarkerPromise = null // let a retry try again
    throw err
  })
  return landmarkerPromise
}

function firstFace(result: FaceLandmarkerResult) {
  if (result.faceLandmarks.length === 0) return null
  const blendshapes: Blendshapes = {}
  for (const c of result.faceBlendshapes?.[0]?.categories ?? []) {
    blendshapes[c.categoryName] = c.score
  }
  return { matrix: result.facialTransformationMatrixes?.[0]?.data ?? null, blendshapes }
}

export type AttentionStatus = 'off' | 'loading' | 'watching' | 'error'

/**
 * Watches the video for whether you're looking at the screen, while `enabled`. Calls
 * `onAlert` once each time looking away passes 5 seconds (rules in utils/attention.ts).
 */
export function useAttention(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onAlert: () => void,
) {
  const [landmarker, setLandmarker] = useState<FaceLandmarker | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [gaze, setGaze] = useState<Gaze | null>(null)
  const [attention, setAttention] = useState<AttentionState>(ATTENTIVE)
  const [checkedAt, setCheckedAt] = useState(0)

  const attentionRef = useRef<AttentionState>(ATTENTIVE)

  // Load the model the first time it's needed
  useEffect(() => {
    if (!enabled || landmarker || loadFailed) return
    let cancelled = false
    loadLandmarker().then(
      (loaded) => {
        if (!cancelled) setLandmarker(loaded)
      },
      () => {
        if (!cancelled) setLoadFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [enabled, landmarker, loadFailed])

  const check = useEffectEvent((model: FaceLandmarker, lastFrame: { time: number }) => {
    const video = videoRef.current

    // Hidden tab: the tab guard already counts that, and frames may be stale. Start fresh.
    if (document.hidden) {
      attentionRef.current = ATTENTIVE
      setAttention(ATTENTIVE)
      setGaze(null)
      return
    }
    // No new frame since the last check: nothing to do
    if (!video || video.readyState < 2 || video.currentTime === lastFrame.time) return
    lastFrame.time = video.currentTime

    const reading = readFace(firstFace(model.detectForVideo(video, performance.now())))
    // Timed after detecting, so a slow frame can't make looking away seem longer
    const now = Date.now()
    const previous = attentionRef.current
    const next = updateAttention(previous, reading.gaze, now)
    attentionRef.current = next

    if (next.alerting && !previous.alerting) onAlert()
    setGaze(reading.gaze)
    setAttention(next)
    setCheckedAt(now)
  })

  // Check a frame every 200 ms. Each check is scheduled after the previous one finishes,
  // so slow frames can never pile up.
  useEffect(() => {
    if (!enabled || !landmarker) return
    const lastFrame = { time: -1 }
    let timer: ReturnType<typeof setTimeout>
    const loop = () => {
      check(landmarker, lastFrame)
      timer = setTimeout(loop, ATTENTION.checkEveryMs)
    }
    timer = setTimeout(loop, ATTENTION.checkEveryMs)
    return () => {
      clearTimeout(timer)
      attentionRef.current = ATTENTIVE
      setAttention(ATTENTIVE)
      setGaze(null)
    }
  }, [enabled, landmarker])

  const status: AttentionStatus = !enabled
    ? 'off'
    : loadFailed
      ? 'error'
      : landmarker
        ? 'watching'
        : 'loading'

  return {
    status,
    gaze: enabled ? gaze : null,
    awayMs: enabled ? awayForMs(attention, checkedAt) : 0,
    alerting: enabled && attention.alerting,
    retry: () => setLoadFailed(false),
  }
}
