import type { Phase } from '../types'

interface Props {
  phase: Phase
  isPaused: boolean
  canStart: boolean
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onReset: () => void
  onSkip: () => void
  onStop: () => void
}

export function TimerControls({
  phase,
  isPaused,
  canStart,
  onStart,
  onPause,
  onResume,
  onReset,
  onSkip,
  onStop,
}: Props) {
  if (phase === 'idle') {
    return (
      <div className="controls">
        <button
          type="button"
          className="button button--primary"
          disabled={!canStart}
          onClick={onStart}
        >
          Start focus
        </button>
      </div>
    )
  }

  return (
    <div className="controls">
      {isPaused ? (
        <button type="button" className="button button--primary" onClick={onResume}>
          Resume
        </button>
      ) : (
        <button type="button" className="button button--primary" onClick={onPause}>
          Pause
        </button>
      )}
      <button type="button" className="button" onClick={onReset}>
        Reset
      </button>
      <button type="button" className="button" onClick={onSkip}>
        {phase === 'break' ? 'Skip break' : 'Skip to break'}
      </button>
      {/* During a break, skipping and stopping are the same thing */}
      {phase === 'focus' && (
        <button type="button" className="button" onClick={onStop}>
          Stop
        </button>
      )}
    </div>
  )
}
