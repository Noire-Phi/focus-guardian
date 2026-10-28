import type { Phase } from '../types'
import { formatClock } from '../utils/time'

const LABELS: Record<Phase, string> = {
  idle: 'Ready to focus',
  focus: 'Focus',
  break: 'Break',
}

interface Props {
  phase: Phase
  remainingMs: number
  isPaused: boolean
}

export function TimerDisplay({ phase, remainingMs, isPaused }: Props) {
  return (
    <div className={`timer timer--${phase}`}>
      <p className="timer__label">
        {LABELS[phase]}
        {isPaused && ' · paused'}
      </p>
      <p className="timer__clock" role="timer">
        {formatClock(remainingMs)}
      </p>
    </div>
  )
}
