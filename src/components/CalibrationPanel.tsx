import type { CalibrationStep } from '../hooks/useCalibration'
import type { Calibration } from '../utils/attention'
import type { RunPhase } from '../utils/calibration'

interface Props {
  calibration: Calibration | null
  needsBook: boolean
  cameraOn: boolean
  step: CalibrationStep
  phase: RunPhase
  progress: number
  error: string | null
  onStart: () => void
  onSkipBook: () => void
  onCancel: () => void
  onDismiss: () => void
}

const INSTRUCTIONS = {
  screen: 'Look at the middle of your screen and keep still.',
  book: 'Put your book or paper where you normally read, then look down at it and keep still.',
}

export function CalibrationPanel(props: Props) {
  const { calibration, needsBook, cameraOn, step, phase, progress, error } = props

  if (step === 'screen' || step === 'book') {
    return (
      <div className="calibration calibration--active" role="status">
        <p className="calibration__step">
          Step {step === 'screen' ? 1 : 2} of 2 · {step === 'screen' ? 'Screen' : 'Book or paper'}
        </p>
        <p>{INSTRUCTIONS[step]}</p>
        <div className="calibration__bar" aria-hidden="true">
          <div className="calibration__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p className="calibration__phase">{phase === 'settle' ? 'Get ready…' : 'Recording…'}</p>
        <div className="calibration__actions">
          {step === 'book' && (
            <button type="button" className="link-button" onClick={props.onSkipBook}>
              Skip (I only use the screen)
            </button>
          )}
          <button type="button" className="link-button" onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="calibration">
      {step === 'failed' && error && (
        <p className="calibration__error" role="alert">
          {error}
        </p>
      )}
      {step === 'done' && (
        <p className="calibration__done" role="status">
          Calibration saved.{' '}
          <button type="button" className="link-button" onClick={props.onDismiss}>
            OK
          </button>
        </p>
      )}
      <p className="calibration__summary">
        Calibrated: screen {calibration ? '✓' : '—'} · book {calibration?.book ? '✓' : '—'}
      </p>
      {needsBook && (
        <p className="calibration__needed">This mode needs your book position. Calibrate first.</p>
      )}
      <button type="button" className="button" disabled={!cameraOn} onClick={props.onStart}>
        {calibration ? 'Recalibrate' : 'Calibrate'}
      </button>
      {!cameraOn && <p className="calibration__hint">Turn on the camera to calibrate.</p>}
    </div>
  )
}
