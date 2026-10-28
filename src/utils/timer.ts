import type { Phase, Settings, TimerState } from '../types'
import { minutesToMs, remainingMs } from './time'

// Pure timer state machine: idle → focus → break → idle.
// Every function takes `now` instead of reading the clock, so the same inputs
// always give the same result (easy to test, safe to call from React).

export const IDLE: TimerState = { phase: 'idle', endsAt: null, pausedRemainingMs: null }

export function phaseDurationMs(phase: Phase, settings: Settings): number {
  if (phase === 'break') return minutesToMs(settings.breakMinutes)
  return minutesToMs(settings.focusMinutes)
}

export function isRunning(state: TimerState): boolean {
  return state.endsAt !== null
}

export function isPaused(state: TimerState): boolean {
  return state.phase !== 'idle' && state.endsAt === null
}

export function start(settings: Settings, now: number): TimerState {
  return {
    phase: 'focus',
    endsAt: now + phaseDurationMs('focus', settings),
    pausedRemainingMs: null,
  }
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.endsAt === null) return state
  return { ...state, endsAt: null, pausedRemainingMs: remainingMs(state.endsAt, now) }
}

export function resume(state: TimerState, now: number): TimerState {
  if (state.pausedRemainingMs === null) return state
  return { ...state, endsAt: now + state.pausedRemainingMs, pausedRemainingMs: null }
}

/**
 * Moves past any phase whose end time has passed. Focus is followed by a break, and a
 * break by idle. The break is timed from when focus *should* have ended, so after a
 * long time away (closed tab, sleeping laptop) the timer catches up correctly instead
 * of starting a fresh break.
 */
export function advance(state: TimerState, settings: Settings, now: number): TimerState {
  let next = state
  while (next.endsAt !== null && next.endsAt <= now) {
    next =
      next.phase === 'focus'
        ? {
            phase: 'break',
            endsAt: next.endsAt + phaseDurationMs('break', settings),
            pausedRemainingMs: null,
          }
        : IDLE
  }
  return next
}

/** What the clock should show. When idle, that's the length of the next focus session. */
export function displayRemainingMs(state: TimerState, settings: Settings, now: number): number {
  if (state.endsAt !== null) return remainingMs(state.endsAt, now)
  if (state.pausedRemainingMs !== null) return state.pausedRemainingMs
  return phaseDurationMs('focus', settings)
}
