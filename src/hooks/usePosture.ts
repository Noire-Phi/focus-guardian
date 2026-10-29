import { useEffect, useRef, useState } from 'react'
import { ATTENTIVE, awayForMs, updateAttention, type AttentionState } from '../utils/attention'
import {
  POSTURE,
  type PostureRules,
  comparePosture,
  measurePosture,
  type PostureMetrics,
  type PostureReading,
} from '../utils/posture'
import type { CameraStats } from '../types'
import { frameSpanMs } from '../utils/focusScore'
import type { TrackerFrame } from './useFaceTracker'

// A posture check normally comes every 600 ms; never count one as more than 1.5 s
const MAX_POSTURE_SPAN_MS = 1500

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
  onMeasure,
  rules = POSTURE,
}: {
  watching: boolean
  baseline: PostureMetrics | null
  onAlert: () => void
  /** Thresholds for the chosen sensitivity */
  rules?: PostureRules
  /** Gets the time each posture check stands for, for the focus score */
  onMeasure?: (delta: Partial<CameraStats>) => void
}) {
  const [reading, setReading] = useState<PostureReading | null>(null)
  const [state, setState] = useState<AttentionState>(ATTENTIVE)
  const [checkedAt, setCheckedAt] = useState(0)
  const stateRef = useRef<AttentionState>(ATTENTIVE)
  const lastAtRef = useRef<number | null>(null)

  const active = watching && baseline !== null

  function reset() {
    stateRef.current = ATTENTIVE
    lastAtRef.current = null
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

    const next = comparePosture(measurePosture(frame.pose.landmarks), baseline, rules)
    setReading(next)
    const span = frameSpanMs(lastAtRef.current, frame.at, MAX_POSTURE_SPAN_MS)
    lastAtRef.current = frame.at
    // Can't see your shoulders: don't count it either way
    if (next.status === 'unknown') return
    onMeasure?.({ postureCheckedMs: span, goodPostureMs: next.status === 'good' ? span : 0 })

    const previous = stateRef.current
    const updated = updateAttention(
      previous,
      next.status === 'good' ? 'looking' : 'away',
      frame.at,
      rules,
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
  }, [active, baseline, rules])

  return {
    handleFrame,
    reading: active ? reading : null,
    badForMs: active ? awayForMs(state, checkedAt) : 0,
    alerting: active && state.alerting,
  }
}
