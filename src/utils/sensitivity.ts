// Sensitivity: how readily the checks flag a distraction. Medium is the defaults in
// ATTENTION and POSTURE; low is more forgiving, high is stricter. Plain functions.

import type { Sensitivity } from '../types'
import { ATTENTION, type AttentionRules } from './attention'
import { POSTURE, type PostureRules } from './posture'

export interface Tuning {
  attention: AttentionRules
  posture: PostureRules
}

const LOW: Tuning = {
  attention: {
    ...ATTENTION,
    sidewaysDeg: 40, // turn your head further before it counts
    targetYawDeg: 25,
    targetPitchDeg: 25,
    alertAfterMs: 10_000, // alert after 10 s instead of 5
    phoneScore: 0.65, // the detector must be surer it's a phone…
    phoneConfirmChecks: 4, // …and see it in 4 checks in a row
  },
  posture: {
    ...POSTURE,
    maxHeadDrop: 0.3,
    maxLeanIn: 0.3,
    maxTiltDeg: 15,
    alertAfterMs: 40_000,
  },
}

const HIGH: Tuning = {
  attention: {
    ...ATTENTION,
    sidewaysDeg: 22,
    targetYawDeg: 15,
    targetPitchDeg: 15,
    alertAfterMs: 3000,
    phoneScore: 0.4,
    phoneConfirmChecks: 2,
  },
  posture: {
    ...POSTURE,
    maxHeadDrop: 0.12,
    maxLeanIn: 0.12,
    maxTiltDeg: 6,
    alertAfterMs: 10_000,
  },
}

const TUNINGS: Record<Sensitivity, Tuning> = {
  low: LOW,
  medium: { attention: ATTENTION, posture: POSTURE },
  high: HIGH,
}

export function tuningFor(sensitivity: Sensitivity): Tuning {
  return TUNINGS[sensitivity]
}

/** One line per level for the settings panel. */
export const SENSITIVITY_HINTS: Record<Sensitivity, string> = {
  low: 'Fewer alerts: allows bigger head turns, alerts after 10 s away, needs to be very sure about phones.',
  medium: 'Balanced: alerts after 5 s away, phones confirmed in 3 checks.',
  high: 'Strict: smaller head turns count, alerts after 3 s, phones confirmed in 2 checks.',
}
