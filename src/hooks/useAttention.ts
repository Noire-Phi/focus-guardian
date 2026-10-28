import { useEffect, useRef, useState } from 'react'
import {
  ATTENTIVE,
  NO_SIGHTINGS,
  awayForMs,
  readFace,
  seenRecently,
  updateAttention,
  updateSightings,
  type AttentionState,
  type Calibration,
  type Reading,
  type Sightings,
  type StudyMode,
} from '../utils/attention'
import type { TrackerFrame } from './useFaceTracker'

/**
 * Judges camera frames (from useFaceTracker) while `watching`: focused or distracted for
 * the study mode, and the 5 second rule. Calls `onAlert` once each time being distracted
 * passes 5 seconds. Rules are in utils/attention.ts.
 */
export function useAttention({
  watching,
  mode,
  calibration,
  onAlert,
}: {
  watching: boolean
  mode: StudyMode
  calibration: Calibration | null
  onAlert: () => void
}) {
  const [reading, setReading] = useState<Reading | null>(null)
  const [attention, setAttention] = useState<AttentionState>(ATTENTIVE)
  const [checkedAt, setCheckedAt] = useState(0)
  const [bookSeen, setBookSeen] = useState(false)

  const attentionRef = useRef<AttentionState>(ATTENTIVE)
  const sightingsRef = useRef<Sightings>(NO_SIGHTINGS)

  function reset() {
    attentionRef.current = ATTENTIVE
    sightingsRef.current = NO_SIGHTINGS
    setAttention(ATTENTIVE)
    setReading(null)
    setBookSeen(false)
  }

  function handleFrame(frame: TrackerFrame) {
    if (!watching) return
    // Hidden tab: the tab guard already counts that. Start fresh when you're back.
    if (frame.hidden) {
      reset()
      return
    }
    if (frame.objects) {
      sightingsRef.current = updateSightings(sightingsRef.current, frame.objects, frame.at)
    }
    const sightings = sightingsRef.current
    const next = readFace(frame.face, {
      mode,
      calibration,
      phoneSeen: seenRecently(sightings.phoneAt, frame.at),
    })
    const previous = attentionRef.current
    const updated = updateAttention(previous, next.gaze, frame.at)
    attentionRef.current = updated

    if (updated.alerting && !previous.alerting) onAlert()
    setReading(next)
    setAttention(updated)
    setCheckedAt(frame.at)
    setBookSeen(seenRecently(sightings.bookAt, frame.at))
  }

  // Start over whenever watching stops or the rules change (mode, calibration)
  useEffect(() => {
    if (!watching) return
    return reset
  }, [watching, mode, calibration])

  return {
    handleFrame,
    reading: watching ? reading : null,
    bookSeen: watching && bookSeen,
    awayMs: watching ? awayForMs(attention, checkedAt) : 0,
    alerting: watching && attention.alerting,
  }
}
