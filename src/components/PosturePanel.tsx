import { useRef } from 'react'
import type { TrackerStatus } from '../hooks/useFaceTracker'
import type { PostureCalibrationStep } from '../hooks/usePostureCalibration'
import { useRestoreFocus } from '../hooks/useRestoreFocus'
import type { RunPhase } from '../utils/calibration'
import type { PostureIssue, PostureMetrics, PostureReading } from '../utils/posture'
import { formatDuration } from '../utils/time'

const ISSUES: Record<PostureIssue, string> = {
  slouching: 'Slouching',
  'leaning-in': 'Leaning in',
  tilted: 'Leaning to one side',
}

interface Props {
  /** The posture check's switch in Settings */
  enabled: boolean
  baseline: PostureMetrics | null
  cameraOn: boolean
  watchAttention: boolean
  poseStatus: TrackerStatus
  reading: PostureReading | null
  badForMs: number
  step: PostureCalibrationStep
  phase: RunPhase
  progress: number
  error: string | null
  onStart: () => void
  onCancel: () => void
  onDismiss: () => void
}

export function PosturePanel(props: Props) {
  const { baseline, cameraOn, step } = props
  // Same as the gaze calibration: keep focus on this panel as its buttons come and go
  const ref = useRef<HTMLDivElement>(null)
  useRestoreFocus(ref, step === 'recording' ? null : 'button:not(:disabled)')

  if (step === 'recording') {
    return (
      <div ref={ref} tabIndex={-1} className="calibration calibration--active" role="status">
        <p className="calibration__step">Good posture</p>
        <p>
          Sit up the way you want to sit: back straight, shoulders relaxed, head level, both
          shoulders in view. Keep still.
        </p>
        <div
          className="calibration__bar"
          role="progressbar"
          aria-label="Posture calibration progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(props.progress * 100)}
        >
          <div
            className="calibration__fill"
            style={{ width: `${Math.round(props.progress * 100)}%` }}
          />
        </div>
        <p className="calibration__phase">
          {props.poseStatus === 'loading'
            ? 'Loading pose detection…'
            : props.phase === 'settle'
              ? 'Get ready…'
              : 'Recording…'}
        </p>
        <div className="calibration__actions">
          <button type="button" className="link-button" onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} tabIndex={-1} className="calibration">
      <h3 className="calibration__title">Posture</h3>
      {!props.enabled && (
        <p className="calibration__summary">The posture check is off in Settings.</p>
      )}
      {props.enabled && cameraOn && baseline && <PostureLine {...props} />}
      {step === 'failed' && props.error && (
        <p className="calibration__error" role="alert">
          {props.error}
        </p>
      )}
      {step === 'done' && (
        <p className="calibration__done" role="status">
          Good posture saved.{' '}
          <button type="button" className="link-button" onClick={props.onDismiss}>
            OK
          </button>
        </p>
      )}
      {!baseline && (
        <p className="calibration__summary">
          Calibrate your good posture to get reminders when you slouch.
        </p>
      )}
      <button type="button" className="button" disabled={!cameraOn} onClick={props.onStart}>
        {baseline ? 'Recalibrate posture' : 'Calibrate posture'}
      </button>
      {!cameraOn && <p className="calibration__hint">Turn on the camera to calibrate.</p>}
    </div>
  )
}

function PostureLine({ watchAttention, poseStatus, reading, badForMs }: Props) {
  if (!watchAttention) {
    return <p className="attention-line">The posture check runs during a focus session.</p>
  }
  if (poseStatus === 'loading') return <p className="attention-line">Loading pose detection…</p>
  if (poseStatus === 'error') {
    return <p className="attention-line attention-line--error">Pose detection unavailable.</p>
  }
  if (!reading) return <p className="attention-line">Checking posture…</p>
  if (reading.status === 'unknown') {
    return <p className="attention-line">Can’t see your shoulders</p>
  }
  if (reading.status === 'good') {
    return <p className="attention-line attention-line--ok">Good posture</p>
  }
  return (
    <p className="attention-line attention-line--away">
      {reading.issues.map((i) => ISSUES[i]).join(', ')} · {formatDuration(badForMs)}
    </p>
  )
}
