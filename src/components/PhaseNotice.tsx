import { phaseEndedMessage, type EndedPhase } from '../utils/phaseEnd'

interface Props {
  ended: EndedPhase
  breakMinutes: number
  onDismiss: () => void
}

/**
 * The on-screen version of the end-of-phase chime, so you know without hearing it. It stays
 * until you dismiss it or use the timer, so it can't be missed by looking away for a moment.
 */
export function PhaseNotice({ ended, breakMinutes, onDismiss }: Props) {
  const { title, text } = phaseEndedMessage(ended, breakMinutes)
  return (
    <div className={`attention-alert attention-alert--phase attention-alert--${ended}`}>
      <strong>{title}</strong>
      <span>{text}</span>
      <button type="button" className="link-button attention-alert__dismiss" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  )
}
