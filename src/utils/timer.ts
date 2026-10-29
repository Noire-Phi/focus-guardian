import type { CameraStats, Phase, Session, SessionDraft, Settings, TimerState } from '../types'
import { EMPTY_CAMERA_STATS, addCameraStats } from './focusScore'
import { minutesToMs, remainingMs } from './time'

// Pure timer state machine: idle → focus → break → idle.
// Every function takes `now` instead of reading the clock, so the same inputs
// always give the same result (easy to test, safe to call from React).

export const IDLE: TimerState = {
  phase: 'idle',
  endsAt: null,
  pausedRemainingMs: null,
  session: null,
}

/** The new timer state, plus the session that just ended (if one did). */
export interface Transition {
  state: TimerState
  finished: Session | null
}

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

function finish(draft: SessionDraft, endedAt: number, completed: boolean): Session {
  const { awaySince, ...rest } = draft
  // Still away when the session ended: count the time up to the end
  const stillAwayMs = awaySince !== null ? Math.max(0, endedAt - awaySince) : 0
  return { ...rest, awayMs: rest.awayMs + stillAwayMs, endedAt, completed }
}

/** Starts a focus session. `id` is passed in (not generated here) to keep this function pure. */
export function start(settings: Settings, now: number, id: string, intention: string): TimerState {
  return {
    phase: 'focus',
    endsAt: now + phaseDurationMs('focus', settings),
    pausedRemainingMs: null,
    session: {
      id,
      intention,
      startedAt: now,
      plannedMinutes: settings.focusMinutes,
      tabLeaves: 0,
      awayMs: 0,
      distractions: [],
      awaySince: null,
    },
  }
}

/** You left the tab. Counts only while a focus session is running, not paused. */
export function leaveTab(state: TimerState, now: number): TimerState {
  const { session } = state
  if (state.phase !== 'focus' || !isRunning(state) || !session || session.awaySince !== null) {
    return state
  }
  return { ...state, session: { ...session, tabLeaves: session.tabLeaves + 1, awaySince: now } }
}

/** You came back. Away time is counted up to the end of the session at most. */
export function returnToTab(state: TimerState, now: number): TimerState {
  const { session } = state
  if (!session || session.awaySince === null) return state
  const backAt = state.endsAt !== null ? Math.min(now, state.endsAt) : now
  const awayMs = session.awayMs + Math.max(0, backAt - session.awaySince)
  return { ...state, session: { ...session, awayMs, awaySince: null } }
}

/** Adds camera time (for the focus score) to the session in progress. Focus only. */
export function addCameraTime(state: TimerState, delta: Partial<CameraStats>): TimerState {
  const { session } = state
  if (state.phase !== 'focus' || !session) return state
  return {
    ...state,
    session: { ...session, camera: addCameraStats(session.camera ?? EMPTY_CAMERA_STATS, delta) },
  }
}

export function addDistraction(state: TimerState, now: number, note: string): TimerState {
  const { session } = state
  if (state.phase !== 'focus' || !session) return state
  return {
    ...state,
    session: { ...session, distractions: [...session.distractions, { at: now, note }] },
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
 * Puts the current phase back to its full length (using the current settings). A paused
 * timer stays paused; a running one keeps running. A focus session keeps its intention,
 * tab leaves and distractions.
 */
export function reset(state: TimerState, settings: Settings, now: number): TimerState {
  if (state.phase === 'idle') return state
  const fullMs = phaseDurationMs(state.phase, settings)
  const session =
    state.session && state.phase === 'focus'
      ? { ...state.session, plannedMinutes: settings.focusMinutes }
      : state.session
  return isPaused(state)
    ? { ...state, pausedRemainingMs: fullMs, session }
    : { ...state, endsAt: now + fullMs, session }
}

/**
 * Jumps to the next phase now. Skipping focus saves the session as not completed and
 * starts the break; skipping a break goes back to idle.
 */
export function skip(state: TimerState, settings: Settings, now: number): Transition {
  if (state.phase === 'focus') {
    return {
      state: {
        phase: 'break',
        endsAt: now + phaseDurationMs('break', settings),
        pausedRemainingMs: null,
        session: null,
      },
      finished: state.session ? finish(state.session, now, false) : null,
    }
  }
  return { state: IDLE, finished: null }
}

/** Ends whatever is running. Stopping during focus saves the session as not completed. */
export function stop(state: TimerState, now: number): Transition {
  return {
    state: IDLE,
    finished: state.phase === 'focus' && state.session ? finish(state.session, now, false) : null,
  }
}

/**
 * Moves past any phase whose end time has passed. Focus is followed by a break, and a
 * break by idle. The break is timed from when focus *should* have ended, so after a
 * long time away (closed tab, sleeping laptop) the timer catches up correctly instead
 * of starting a fresh break. A focus session that runs out counts as completed.
 */
export function advance(state: TimerState, settings: Settings, now: number): Transition {
  let next = state
  let finished: Session | null = null

  while (next.endsAt !== null && next.endsAt <= now) {
    if (next.phase === 'focus') {
      if (next.session) finished = finish(next.session, next.endsAt, true)
      next = {
        phase: 'break',
        endsAt: next.endsAt + phaseDurationMs('break', settings),
        pausedRemainingMs: null,
        session: null,
      }
    } else {
      next = IDLE
    }
  }
  return { state: next, finished }
}

/** What the clock should show. When idle, that's the length of the next focus session. */
export function displayRemainingMs(state: TimerState, settings: Settings, now: number): number {
  if (state.endsAt !== null) return remainingMs(state.endsAt, now)
  if (state.pausedRemainingMs !== null) return state.pausedRemainingMs
  return phaseDurationMs('focus', settings)
}
