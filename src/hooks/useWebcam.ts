import { useEffect, useRef, useState } from 'react'
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

/**
 * Turns the camera on and off. The camera is only requested when you call `start`,
 * and it's always released on `stop` or when the component using this unmounts.
 * Failures come back as `error` with a title and message to show (see utils/webcam.ts).
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
    } catch (err) {
      if (request === requestRef.current) fail(toWebcamError(err))
    }
  }

  function stop() {
    requestRef.current++
    releaseCamera()
    setStream(null)
    setError(null)
    setStatus('idle')
  }

  useEffect(
    () => () => {
      requestRef.current++
      releaseCamera()
    },
    [],
  )

  return { status, stream, error, start, stop }
}
