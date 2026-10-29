import type { TrackerStatus } from '../hooks/useFaceTracker'
import type { Reading, Reason, StudyMode } from '../utils/attention'
import { formatDuration } from '../utils/time'

interface Props {
  watchAttention: boolean
  needsBook: boolean
  status: TrackerStatus
  objectStatus: TrackerStatus
  mode: StudyMode
  reading: Reading | null
  bookSeen: boolean
  awayMs: number
  onRetry: () => void
}

function describe(reason: Reason, mode: StudyMode, bookSeen: boolean): string {
  switch (reason) {
    case 'on-screen':
      return 'Looking at the screen'
    case 'on-book':
      return bookSeen ? 'Reading · book in view' : 'Looking at your book or paper'
    case 'between':
      return 'Moving between screen and book'
    case 'sideways':
      return 'Turned sideways'
    case 'eyes-away':
      return 'Eyes looking away'
    case 'phone':
      return 'Phone in view'
    case 'unchecked':
      return 'Watching for phones'
    case 'no-face':
      return 'No face in view'
    case 'off-target':
      return mode === 'book' ? 'Not looking at your book' : 'Looking away from the screen'
  }
}

/** One line under the camera saying what the focus check sees right now. */
export function AttentionStatus(props: Props) {
  const { watchAttention, needsBook, status, objectStatus, mode, reading, bookSeen, awayMs } = props

  if (!watchAttention) {
    return <p className="attention-line">The focus check runs during a focus session.</p>
  }
  if (needsBook) {
    return <p className="attention-line">Calibrate your book position to use this mode.</p>
  }
  if (status === 'loading') return <p className="attention-line">Loading face detection…</p>
  if (status === 'error') {
    return (
      <p className="attention-line attention-line--error">
        Couldn’t load face detection. Check your internet connection.{' '}
        <button type="button" className="link-button" onClick={props.onRetry}>
          Try again
        </button>
      </p>
    )
  }
  if (!reading) return <p className="attention-line">Checking…</p>

  const text = describe(reading.reason, mode, bookSeen)
  const objectNote =
    objectStatus === 'loading'
      ? ' (loading phone detection…)'
      : objectStatus === 'error'
        ? ' (phone detection unavailable)'
        : ''

  return reading.gaze === 'looking' ? (
    <p className="attention-line attention-line--ok">
      {text}
      {objectNote}
    </p>
  ) : (
    <p className="attention-line attention-line--away">
      {text} · {formatDuration(awayMs)}
      {objectNote}
    </p>
  )
}
