import { useEffect, useRef } from 'react'
import { useWebcam } from '../hooks/useWebcam'

export function Webcam() {
  const { status, stream, error, start, stop } = useWebcam()
  const videoRef = useRef<HTMLVideoElement>(null)

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
    </section>
  )
}
