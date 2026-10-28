import { useEffect, useRef } from 'react'
import { useAttention, type AttentionStatus } from '../hooks/useAttention'
import { useWebcam } from '../hooks/useWebcam'
import type { Gaze } from '../utils/attention'
import { playChime } from '../utils/sound'
import { formatDuration } from '../utils/time'

interface Props {
  /** Watch for looking away (only while a focus session is running) */
  watchAttention: boolean
  sound: boolean
}

export function Webcam({ watchAttention, sound }: Props) {
  const { status, stream, error, start, stop } = useWebcam()
  const videoRef = useRef<HTMLVideoElement>(null)
  const attention = useAttention(videoRef, watchAttention && status === 'active', () => {
    if (sound) playChime()
  })

  // A MediaStream can't be passed as a prop, so attach it to the <video> directly
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  return (
    <section className="webcam" aria-labelledby="webcam-title">
      <h2 id="webcam-title" className="section-title">
        Camera
      </h2>

      <div className={`webcam__frame${status === 'active' ? ' webcam__frame--live' : ''}`}>
        <video
          ref={videoRef}
          className="webcam__video"
          autoPlay
          playsInline
          muted
          hidden={status !== 'active'}
          aria-label="Camera preview"
        />
        {status !== 'active' && (
          <p className="webcam__placeholder">
            {status === 'starting' ? 'Waiting for the camera…' : 'Camera is off'}
          </p>
        )}
      </div>

      {status === 'active' && (
        <AttentionLine
          status={attention.status}
          gaze={attention.gaze}
          awayMs={attention.awayMs}
          watchAttention={watchAttention}
          onRetry={attention.retry}
        />
      )}

      {error && (
        <div className="webcam__error" role="alert">
          <p className="webcam__error-title">{error.title}</p>
          <p>{error.message}</p>
        </div>
      )}

      <div className="controls">
        {status === 'active' ? (
          <button type="button" className="button" onClick={stop}>
            Turn off camera
          </button>
        ) : (
          <button
            type="button"
            className="button button--primary"
            disabled={status === 'starting'}
            onClick={start}
          >
            {error ? 'Try again' : 'Turn on camera'}
          </button>
        )}
      </div>

      {attention.alerting && (
        <div className="attention-alert" role="alert">
          <strong>Eyes back on your work</strong>
          <span>You’ve been looking away for {formatDuration(attention.awayMs)}.</span>
        </div>
      )}
    </section>
  )
}

interface AttentionLineProps {
  status: AttentionStatus
  gaze: Gaze | null
  awayMs: number
  watchAttention: boolean
  onRetry: () => void
}

function AttentionLine({ status, gaze, awayMs, watchAttention, onRetry }: AttentionLineProps) {
  if (!watchAttention) {
    return <p className="attention-line">Looking-away check runs during a focus session.</p>
  }
  if (status === 'loading') {
    return <p className="attention-line">Loading face detection…</p>
  }
  if (status === 'error') {
    return (
      <p className="attention-line attention-line--error">
        Couldn’t load face detection. Check your internet connection.{' '}
        <button type="button" className="link-button" onClick={onRetry}>
          Try again
        </button>
      </p>
    )
  }
  if (gaze === null) {
    return <p className="attention-line">Checking…</p>
  }
  if (gaze === 'looking') {
    return <p className="attention-line attention-line--ok">Looking at the screen</p>
  }
  return (
    <p className="attention-line attention-line--away">
      {gaze === 'no-face' ? 'No face in view' : 'Looking away'} · {formatDuration(awayMs)}
    </p>
  )
}
