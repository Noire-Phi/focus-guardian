import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { checkWebcamSupport, toWebcamError, webcamError, type WebcamError } from '../utils/webcam'

export type WebcamStatus = 'idle' | 'starting' | 'active' | 'error'

// The checks look at 5 frames a second and the models shrink each frame to 256 px or less,
// so a small, slower stream is plenty and saves the camera and browser work. "ideal" means
// any camera still works: it gets as close as it can.
export const VIDEO: MediaTrackConstraints = {
  width: { ideal: 640 },
  height: { ideal: 480 },
  frameRate: { ideal: 15 },
}

// Remembers, for this tab only, that the camera was on, so a refresh can turn it back on
const WAS_ON_KEY = 'focus-guardian:camera-on'

function rememberOn(on: boolean) {
  try {
    if (on) sessionStorage.setItem(WAS_ON_KEY, '1')
    else sessionStorage.removeItem(WAS_ON_KEY)
  } catch {
    // Storage blocked: the camera just won't come back on by itself after a refresh
  }
}

function wasOn(): boolean {
  try {
    return sessionStorage.getItem(WAS_ON_KEY) === '1'
  } catch {
    return false
  }
}

/** True only if the browser will give the camera without asking (never shows a prompt). */
async function cameraAllowed(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName })
    return status.state === 'granted'
  } catch {
    // Browsers that can't say (or no Permissions API): don't guess
    return false
  }
}

/**
 * Turns the camera on and off. The camera is only requested when you call `start`,
 * and it's always released on `stop` or when the component using this unmounts.
 * Failures come back as `error` with a title and message to show (see utils/webcam.ts).
 *
 * If the camera was on in this tab before a refresh, it's turned back on, but only when the
 * browser already allows it, so a refresh never brings up a permission prompt by itself.
 */
export function useWebcam() {
  const [status, setStatus] = useState<WebcamStatus>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<WebcamError | null>(null)

  // The live stream, for cleanup without waiting for a render
  const streamRef = useRef<MediaStream | null>(null)
  // Bumped on every start/stop/unmount, so a slow request that finishes late is thrown away
  const requestRef = useRef(0)

  function releaseCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  function fail(next: WebcamError) {
    rememberOn(false)
    releaseCamera()
    setStream(null)
    setError(next)
    setStatus('error')
  }

  async function start() {
    const unsupported = checkWebcamSupport()
    if (unsupported) {
      fail(unsupported)
      return
    }

    const request = ++requestRef.current
    releaseCamera()
    setStream(null)
    setError(null)
    setStatus('starting')

    try {
      const next = await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: false })
      if (request !== requestRef.current) {
        // Stopped or unmounted while the browser was asking: don't leave the camera on
        next.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = next
      next.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (streamRef.current === next) fail(webcamError('disconnected'))
      })
      setStream(next)
      setStatus('active')
      rememberOn(true)
    } catch (err) {
      if (request === requestRef.current) fail(toWebcamError(err))
    }
  }

  function stop() {
    rememberOn(false)
    requestRef.current++
    releaseCamera()
    setStream(null)
    setError(null)
    setStatus('idle')
  }

  // Back after a refresh: turn the camera on again if it was on and is still allowed
  const resume = useEffectEvent(() => void start())
  useEffect(() => {
    if (!wasOn()) return
    let cancelled = false
    void cameraAllowed().then((allowed) => {
      if (!cancelled && allowed) resume()
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(
    () => () => {
      requestRef.current++
      releaseCamera()
    },
    [],
  )

  return { status, stream, error, start, stop }
}
