// The browser tab's title. While a phase runs it shows the time left, so the timer can be
// followed from another tab or window, and when a break runs out it says so.

import type { Phase } from '../types'
import type { EndedPhase } from './phaseEnd'
import { formatClock } from './time'

export const APP_NAME = 'Focus Guardian'

export function pageTitle(
  phase: Phase,
  remainingMs: number,
  isPaused: boolean,
  phaseEnded: EndedPhase | null,
): string {
  if (phase === 'idle') {
    return phaseEnded === 'break' ? `Break’s over · ${APP_NAME}` : APP_NAME
  }
  const label = isPaused ? 'Paused' : phase === 'focus' ? 'Focus' : 'Break'
  return `${formatClock(remainingMs)} ${label} · ${APP_NAME}`
}
