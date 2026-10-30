import { useEffect, useEffectEvent, useState } from 'react'
import type { CameraStats, Session, Settings } from '../types'
import { alertCue } from '../utils/alerts'
import type { EndedPhase } from '../utils/phaseEnd'
import { loadTimerState, saveTimerState } from '../utils/storage'
import * as timer from '../utils/timer'
import { useTabGuard } from './useTabGuard'

// How often the clock re-renders. Under a second so the display never skips a second.
const TICK_MS = 250
// Background tabs may tick only about once a minute, so allow a bit more than that
const CHIME_WINDOW_MS = 90_000

/**
 * Runs the focus/break timer. The rules live in utils/timer.ts; this hook adds the clock
 * and saving. `onSessionEnd` is called with each focus session when it finishes or is
 * stopped. It can be called twice for the same session (React StrictMode runs effects
 * twice in development), so the receiver should ignore an id it already has.
 */
export function useFocusTimer(settings: Settings, onSessionEnd: (session: Session) => void) {
  // Loaded as saved; the first tick catches up on anything that ended while the app was closed.
  // If the tab was closed mid-session, that counts as time away, ending now. A refresh isn't
  // leaving: the page hides itself while unloading, so that "leave" is taken back.
  const [state, setState] = useState(() => {
    const saved = loadTimerState() ?? timer.IDLE
    if (document.visibilityState !== 'visible') return saved
    const now = Date.now()
    return timer.returnToTab(isReload() ? timer.forgetReloadLeave(saved, now) : saved, now)
  })
  // The time of the last tick. Kept in state so rendering never reads the clock itself.
  const [now, setNow] = useState(() => Date.now())
  // The phase that just ran out on its own, until you act or dismiss it: shown and announced,
  // so the end of a phase isn't only a sound
  const [phaseEnded, setPhaseEnded] = useState<EndedPhase | null>(null)

  const running = timer.isRunning(state)

  function apply({ state: next, finished }: timer.Transition) {
    setState(next)
    if (finished) onSessionEnd(finished)
  }

  // An effect event always sees the latest state and props without restarting the interval
  const tick = useEffectEvent(() => {
    const t = Date.now()
    setNow(t)
    const transition = timer.advance(state, settings, t)
    // Nothing ended: leave the state alone. Writing it back would undo changes made since the
    // last render, such as camera time passed on a moment ago from the camera's own timer.
    if (transition.state === state) return
    // Alert when a phase just ended, but not when catching up on one that ended long ago
    const justEnded = state.endsAt !== null && t - state.endsAt < CHIME_WINDOW_MS
    if (transition.state.phase !== state.phase && justEnded && state.phase !== 'idle') {
      alertCue(settings)
      setPhaseEnded(state.phase)
    }
    apply(transition)
  })

  useEffect(() => {
    saveTimerState(state)
  }, [state])

  useEffect(() => {
    if (!running) return
    const id = setInterval(tick, TICK_MS)
    return () => clearInterval(id)
  }, [running])

  useTabGuard(
    () => {
      // Tab leaves switched off in Settings: don't count them
      if (!settings.detections.tabLeaves) return
      const now = Date.now()
      setState((s) => timer.leaveTab(s, now))
      // Save right away: the tab may be closing, and effects won't get another chance to run
      saveTimerState(timer.leaveTab(state, now))
    },
    () => {
      const now = Date.now()
      setState((s) => timer.returnToTab(s, now))
    },
  )

  // Each action updates `now` too, so the display is right before the next tick arrives
  // Acting on the timer also clears the "phase ended" notice: you've seen it
  function act(update: (t: number) => void) {
    const t = Date.now()
    setNow(t)
    setPhaseEnded(null)
    update(t)
  }

  return {
    phase: state.phase,
    session: state.session,
    now,
    remainingMs: timer.displayRemainingMs(state, settings, now),
    isPaused: timer.isPaused(state),
    /** 'focus' or 'break' when that phase just ran out by itself; null once you act */
    phaseEnded,
    dismissPhaseEnded: () => setPhaseEnded(null),
    /** Adds camera time to the session in progress (functional update: safe from timers) */
    recordCamera: (delta: Partial<CameraStats>) => setState((s) => timer.addCameraTime(s, delta)),
    addDistraction: (note: string) => {
      const now = Date.now()
      setState((s) => timer.addDistraction(s, now, note))
    },
    start: (intention: string) =>
      act((t) => setState(timer.start(settings, t, crypto.randomUUID(), intention))),
    pause: () => act((t) => setState(timer.pause(state, t))),
    resume: () => act((t) => setState(timer.resume(state, t))),
    reset: () => act((t) => setState(timer.reset(state, settings, t))),
    skip: () => act((t) => apply(timer.skip(state, settings, t))),
    stop: () => act((t) => apply(timer.stop(state, t))),
  }
}

/** This page load is a refresh (F5, or the reload button), not opening the app afresh. */
function isReload(): boolean {
  const [entry] = performance.getEntriesByType?.('navigation') ?? []
  return (entry as PerformanceNavigationTiming | undefined)?.type === 'reload'
}
