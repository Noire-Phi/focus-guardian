import { useEffect, useRef, useState } from 'react'
import {
  ATTENTIVE,
  NO_PHONE,
  awayForMs,
  readFace,
  seenRecently,
  updateAttention,
  updateBookSeenAt,
  updatePhone,
  type AttentionState,
  type Calibration,
  type PhoneTracker,
  type Reading,
  type StudyMode,
} from '../utils/attention'
import type { TrackerFrame } from './useFaceTracker'

/**
 * Judges camera frames (from useFaceTracker) while `watching`: focused or distracted for
 * the study mode, and the 5 second rule. Calls `onAlert` once per stretch of distraction:
 * after 5 seconds, or straight away when a phone is confirmed. Rules are in
 * utils/attention.ts.
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
  const [phoneConfirmed, setPhoneConfirmed] = useState(false)

  const attentionRef = useRef<AttentionState>(ATTENTIVE)
  const phoneRef = useRef<PhoneTracker>(NO_PHONE)
  const bookAtRef = useRef<number | null>(null)

  function reset() {
    attentionRef.current = ATTENTIVE
    phoneRef.current = NO_PHONE
    bookAtRef.current = null
    setAttention(ATTENTIVE)
    setReading(null)
    setBookSeen(false)
    setPhoneConfirmed(false)
  }

  function handleFrame(frame: TrackerFrame) {
    if (!watching) return
    // Hidden tab: the tab guard already counts that. Start fresh when you're back.
    if (frame.hidden) {
      reset()
      return
    }
    // Object results arrive on some frames only (every 500 ms); the counts move then
    if (frame.objects) {
      phoneRef.current = updatePhone(phoneRef.current, frame.objects.phone)
      bookAtRef.current = updateBookSeenAt(bookAtRef.current, frame.objects, frame.at)
    }
    const phone = phoneRef.current
    const next = readFace(frame.face, { mode, calibration, phoneConfirmed: phone.confirmed })

    const previous = attentionRef.current
    const stepped = updateAttention(previous, next.gaze, frame.at)
    // A confirmed phone alerts right away: seeing it several checks in a row is already
    // the guard against false alarms, so it doesn't also wait for the 5 seconds
    const updated = phone.confirmed ? { ...stepped, alerting: true } : stepped
    attentionRef.current = updated

    if (updated.alerting && !previous.alerting) onAlert()
    setReading(next)
    setAttention(updated)
    setCheckedAt(frame.at)
    setPhoneConfirmed(phone.confirmed)
    setBookSeen(mode === 'book' && seenRecently(bookAtRef.current, frame.at))
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
    phoneConfirmed: watching && phoneConfirmed,
    awayMs: watching ? awayForMs(attention, checkedAt) : 0,
    alerting: watching && attention.alerting,
  }
}
