import { useEffect, useRef } from 'react'
import { useAttention } from '../hooks/useAttention'
import { useCalibration } from '../hooks/useCalibration'
import { useFaceTracker, type TrackerFrame } from '../hooks/useFaceTracker'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useWebcam } from '../hooks/useWebcam'
import { needsBookCalibration } from '../utils/attention'
import { playChime } from '../utils/sound'
import { loadAttentionPrefs, saveAttentionPrefs } from '../utils/storage'
import { formatDuration } from '../utils/time'
import { AttentionStatus } from './AttentionStatus'
import { CalibrationPanel } from './CalibrationPanel'
import { StudyModePicker } from './StudyModePicker'

interface Props {
  /** Run the focus check (only while a focus session is running) */
  watchAttention: boolean
  sound: boolean
}

export function Webcam({ watchAttention, sound }: Props) {
  const camera = useWebcam()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [prefs, setPrefs] = useLocalStorage(loadAttentionPrefs, saveAttentionPrefs)
  const { studyMode, calibration } = prefs

  const cameraOn = camera.status === 'active'
  const calibrate = useCalibration((next) => setPrefs({ ...prefs, calibration: next }))
  const needsBook = needsBookCalibration(studyMode, calibration)
  const watching = watchAttention && cameraOn && !calibrate.recording && !needsBook

  const attention = useAttention({
    watching,
    mode: studyMode,
    calibration,
    onAlert: () => {
      if (sound) playChime()
    },
  })

  const tracker = useFaceTracker(videoRef, {
    active: cameraOn && (watching || calibrate.recording),
    // The object detector is only needed in Book mode, so it isn't even loaded otherwise
    detectObjects: watching && studyMode === 'book',
    onFrame: (frame: TrackerFrame) => {
      attention.handleFrame(frame)
      calibrate.handleFrame(frame)
    },
  })

  // A MediaStream can't be passed as a prop, so attach it to the <video> directly
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = camera.stream
  }, [camera.stream])

  return (
    <section className="webcam" aria-labelledby="webcam-title">
      <h2 id="webcam-title" className="section-title">
        Camera
      </h2>

      <StudyModePicker
        value={studyMode}
        onChange={(mode) => setPrefs({ ...prefs, studyMode: mode })}
      />

      <div className={`webcam__frame${cameraOn ? ' webcam__frame--live' : ''}`}>
        <video
          ref={videoRef}
          className="webcam__video"
          autoPlay
          playsInline
          muted
          hidden={!cameraOn}
          aria-label="Camera preview"
        />
        {!cameraOn && (
          <p className="webcam__placeholder">
            {camera.status === 'starting' ? 'Waiting for the camera…' : 'Camera is off'}
          </p>
        )}
      </div>

      {cameraOn && !calibrate.recording && (
        <AttentionStatus
          watchAttention={watchAttention}
          needsBook={needsBook}
          status={tracker.status}
          objectStatus={tracker.objectStatus}
          mode={studyMode}
          reading={attention.reading}
          bookSeen={attention.bookSeen}
          awayMs={attention.awayMs}
          onRetry={tracker.retry}
        />
      )}

      {camera.error && (
        <div className="webcam__error" role="alert">
          <p className="webcam__error-title">{camera.error.title}</p>
          <p>{camera.error.message}</p>
        </div>
      )}

      <div className="controls">
        {cameraOn ? (
          <button type="button" className="button" onClick={camera.stop}>
            Turn off camera
          </button>
        ) : (
          <button
            type="button"
            className="button button--primary"
            disabled={camera.status === 'starting'}
            onClick={camera.start}
          >
            {camera.error ? 'Try again' : 'Turn on camera'}
          </button>
        )}
      </div>

      <CalibrationPanel
        calibration={calibration}
        needsBook={needsBook}
        cameraOn={cameraOn}
        step={calibrate.step}
        phase={calibrate.phase}
        progress={calibrate.progress}
        error={calibrate.error}
        onStart={calibrate.start}
        onSkipBook={calibrate.skipBook}
        onCancel={calibrate.cancel}
        onDismiss={calibrate.dismiss}
      />

      {attention.alerting && (
        <div className="attention-alert" role="alert">
          <strong>Eyes back on your work</strong>
          <span>You’ve been distracted for {formatDuration(attention.awayMs)}.</span>
        </div>
      )}
    </section>
  )
}
