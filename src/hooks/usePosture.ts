import { useEffect, useRef, useState } from 'react'
import { ATTENTIVE, awayForMs, updateAttention, type AttentionState } from '../utils/attention'
import {
  POSTURE,
  comparePosture,
  measurePosture,
  type PostureMetrics,
  type PostureReading,
} from '../utils/posture'
import type { TrackerFrame } from './useFaceTracker'

/**
 * Compares your posture with your calibrated good posture while `watching`. Bad posture
 * must last 20 seconds before `onAlert` is called (once), and good posture 3 seconds to
 * clear it. This reuses the same "stretch" rule as the focus check, with longer times,
 * since posture drifts slowly and shifting in your seat for a moment isn't a problem.
 */
export function usePosture({
  watching,
  baseline,
  onAlert,
}: {
  watching: boolean
  baseline: PostureMetrics | null
  onAlert: () => void
}) {
  const [reading, setReading] = useState<PostureReading | null>(null)
  const [state, setState] = useState<AttentionState>(ATTENTIVE)
  const [checkedAt, setCheckedAt] = useState(0)
  const stateRef = useRef<AttentionState>(ATTENTIVE)

  const active = watching && baseline !== null

  function reset() {
    stateRef.current = ATTENTIVE
    setState(ATTENTIVE)
    setReading(null)
  }

  function handleFrame(frame: TrackerFrame) {
    if (!active || !baseline) return
    if (frame.hidden) {
      reset()
      return
    }
    // Posture is only measured on some checks (every 500 ms)
    if (!frame.pose) return

    const next = comparePosture(measurePosture(frame.pose.landmarks), baseline)
    setReading(next)
    // Can't see your shoulders: don't count it either way
    if (next.status === 'unknown') return

    const previous = stateRef.current
    const updated = updateAttention(
      previous,
      next.status === 'good' ? 'looking' : 'away',
      frame.at,
      POSTURE,
    )
    stateRef.current = updated
    if (updated.alerting && !previous.alerting) onAlert()
    setState(updated)
    setCheckedAt(frame.at)
  }

  // Start over when watching stops or the baseline changes (recalibrated)
  useEffect(() => {
    if (!active) return
    return reset
  }, [active, baseline])

  return {
    handleFrame,
    reading: active ? reading : null,
    badForMs: active ? awayForMs(state, checkedAt) : 0,
    alerting: active && state.alerting,
  }
}
