import { useEffect, useEffectEvent, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAttention } from '../hooks/useAttention'
import { useCalibration } from '../hooks/useCalibration'
import { useFaceTracker, type TrackerFrame } from '../hooks/useFaceTracker'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { usePosture } from '../hooks/usePosture'
import { usePostureCalibration } from '../hooks/usePostureCalibration'
import { useWebcam } from '../hooks/useWebcam'
import type { CameraStats, Settings } from '../types'
import { needsBookCalibration } from '../utils/attention'
import { EMPTY_CAMERA_STATS, addCameraStats } from '../utils/focusScore'
import { alertCue } from '../utils/alerts'
import { tuningFor } from '../utils/sensitivity'
import { loadAttentionPrefs, saveAttentionPrefs } from '../utils/storage'
import { formatDuration } from '../utils/time'
import { AttentionStatus } from './AttentionStatus'
import { CalibrationPanel } from './CalibrationPanel'
import { PosturePanel } from './PosturePanel'
import { PrivacyNote } from './PrivacyNote'
import { StudyModePicker } from './StudyModePicker'

interface Props {
  /** Run the focus check (only while a focus session is running) */
  watchAttention: boolean
  /** Alert sound and flash, which checks are on, and how sensitive they are */
  settings: Pick<Settings, 'sound' | 'flash' | 'detections' | 'sensitivity'>
  /** Where alerts are shown (the app's alert stack at the bottom of the window) */
  alertRoot?: HTMLElement | null
  /** Receives camera time for the focus score, about once a second */
  onCameraStats?: (delta: CameraStats) => void
}

// How often collected camera time is passed on to the session
const FLUSH_EVERY_MS = 1000

export const CAMERA_LOST =
  'The camera went off, so calibration stopped. Turn it back on and try again.'

export function Webcam({ watchAttention, settings, alertRoot, onCameraStats }: Props) {
  const { detections } = settings
  const tuning = tuningFor(settings.sensitivity)
  const checkGaze = detections.lookingAway
  const checkPhone = detections.phone
  const camera = useWebcam()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [prefs, setPrefs] = useLocalStorage(loadAttentionPrefs, saveAttentionPrefs)
  const { studyMode, calibration } = prefs

  const cameraOn = camera.status === 'active'
  const calibrate = useCalibration((next) => setPrefs({ ...prefs, calibration: next }))
  const calibratePosture = usePostureCalibration((posture) => setPrefs({ ...prefs, posture }))
  const calibrating = calibrate.recording || calibratePosture.recording
  // Book and Mixed need the book position, but only for the looking-away check
  const needsBook = checkGaze && needsBookCalibration(studyMode, calibration)
  const watching =
    watchAttention && cameraOn && !calibrating && (checkGaze || checkPhone) && !needsBook
  // Posture is checked during a focus session once it's on and calibrated, in any mode
  const watchingPosture =
    watchAttention && cameraOn && !calibrating && detections.posture && prefs.posture !== null

  // Camera time is collected here and passed on in batches, so the session (which is
  // saved on every change) isn't updated five times a second
  const pendingStats = useRef<CameraStats>(EMPTY_CAMERA_STATS)
  const collect = (delta: Partial<CameraStats>) => {
    pendingStats.current = addCameraStats(pendingStats.current, delta)
  }
  const flush = useEffectEvent(() => {
    if (pendingStats.current.checkedMs === 0 && pendingStats.current.postureCheckedMs === 0) return
    onCameraStats?.(pendingStats.current)
    pendingStats.current = EMPTY_CAMERA_STATS
  })

  const attention = useAttention({
    watching,
    mode: studyMode,
    calibration,
    rules: tuning.attention,
    checkGaze,
    checkPhone,
    onMeasure: collect,
    onAlert: () => alertCue(settings),
  })

  const posture = usePosture({
    watching: watchingPosture,
    baseline: prefs.posture,
    rules: tuning.posture,
    onMeasure: collect,
    onAlert: () => alertCue(settings),
  })

  const tracker = useFaceTracker(videoRef, {
    active: cameraOn && (watching || watchingPosture || calibrating),
    // Phones are looked for in every mode while the check runs (not while calibrating)
    detectObjects: watching && checkPhone,
    detectPose: watchingPosture || calibratePosture.recording,
    onFrame: (frame: TrackerFrame) => {
      attention.handleFrame(frame)
      calibrate.handleFrame(frame)
      posture.handleFrame(frame)
      calibratePosture.handleFrame(frame)
    },
  })

  // The camera went off mid-calibration (unplugged, or turned off): stop with a reason instead
  // of waiting for frames that will never come
  const stopCalibrating = useEffectEvent(() => {
    calibrate.interrupt(CAMERA_LOST)
    calibratePosture.interrupt(CAMERA_LOST)
  })
  useEffect(() => {
    if (!cameraOn) stopCalibrating()
  }, [cameraOn])

  const measuring = watching || watchingPosture
  useEffect(() => {
    if (!measuring) return
    const id = setInterval(flush, FLUSH_EVERY_MS)
    return () => {
      clearInterval(id)
      flush() // pass on what's left when the check stops
    }
  }, [measuring])

  // A MediaStream can't be passed as a prop, so attach it to the <video> directly
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = camera.stream
  }, [camera.stream])

  return (
    <section className="webcam card" aria-labelledby="webcam-title">
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

      {cameraOn && !calibrating && !checkGaze && !checkPhone && (
        <p className="attention-line">Looking-away and phone checks are off in Settings.</p>
      )}
      {cameraOn && !calibrating && (checkGaze || checkPhone) && (
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

      <PosturePanel
        enabled={detections.posture}
        baseline={prefs.posture}
        cameraOn={cameraOn}
        watchAttention={watchAttention}
        poseStatus={tracker.poseStatus}
        reading={posture.reading}
        badForMs={posture.badForMs}
        step={calibratePosture.step}
        phase={calibratePosture.phase}
        progress={calibratePosture.progress}
        error={calibratePosture.error}
        onStart={calibratePosture.start}
        onCancel={calibratePosture.cancel}
        onDismiss={calibratePosture.dismiss}
      />

      <PrivacyNote />

      {/* Shown in the app's alert stack, so they're seen on the dashboard too */}
      {alertRoot &&
        createPortal(
          <>
            {attention.alerting && (
              <div className="attention-alert" role="alert">
                {attention.phoneConfirmed ? (
                  <>
                    <strong>Phone detected</strong>
                    <span>Put your phone away to stay focused.</span>
                  </>
                ) : (
                  <>
                    <strong>Eyes back on your work</strong>
                    {/* The counter ticks every second; screen readers get one steady sentence
                      instead of having it read out again with each change */}
                    <span aria-hidden="true">
                      You’ve been distracted for {formatDuration(attention.awayMs)}.
                    </span>
                    <span className="visually-hidden">
                      You’ve been looking away from your work.
                    </span>
                  </>
                )}
              </div>
            )}
            {posture.alerting && (
              <div className="attention-alert attention-alert--posture" role="alert">
                <strong>Check your posture</strong>
                <span>
                  {posture.reading?.status === 'bad'
                    ? `${posture.reading.issues.includes('slouching') ? 'You’re slouching' : 'Your posture has drifted'}. `
                    : ''}
                  Sit back up like when you calibrated.
                </span>
              </div>
            )}
          </>,
          alertRoot,
        )}
    </section>
  )
}
