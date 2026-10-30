import { useRef } from 'react'
import type { CalibrationStep } from '../hooks/useCalibration'
import { useRestoreFocus } from '../hooks/useRestoreFocus'
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
  const active = step === 'screen' || step === 'book'
  // "Calibrate" and "OK" disappear when pressed: keep focus on this panel. While recording,
  // focus the panel itself so its instructions are read, not the Cancel button.
  const ref = useRef<HTMLDivElement>(null)
  useRestoreFocus(ref, active ? null : 'button:not(:disabled)')

  if (active) {
    return (
      <div ref={ref} tabIndex={-1} className="calibration calibration--active" role="status">
        <p className="calibration__step">
          Step {step === 'screen' ? 1 : 2} of 2 · {step === 'screen' ? 'Screen' : 'Book or paper'}
        </p>
        <p>{INSTRUCTIONS[step]}</p>
        <div
          className="calibration__bar"
          role="progressbar"
          aria-label="Calibration progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
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
    <div ref={ref} tabIndex={-1} className="calibration">
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
        Calibrated: screen <Done done={calibration !== null} /> · book{' '}
        <Done done={Boolean(calibration?.book)} />
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

/** A tick or a dash on screen; "done" or "not yet" for screen readers. */
function Done({ done }: { done: boolean }) {
  return (
    <>
      <span aria-hidden="true">{done ? '✓' : '—'}</span>
      <span className="visually-hidden">{done ? 'done' : 'not yet'}</span>
    </>
  )
}
