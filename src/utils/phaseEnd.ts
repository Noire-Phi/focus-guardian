import type { Phase } from '../types'

export type EndedPhase = Exclude<Phase, 'idle'>

/** What to say when a phase runs out: shown on screen and read out by screen readers. */
export function phaseEndedMessage(ended: EndedPhase, breakMinutes: number) {
  return ended === 'focus'
    ? { title: 'Focus session done', text: `Time for a ${breakMinutes}-minute break.` }
    : { title: 'Break’s over', text: 'Start your next focus session when you’re ready.' }
}
