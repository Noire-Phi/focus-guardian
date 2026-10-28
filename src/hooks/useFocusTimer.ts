import { useEffect, useEffectEvent, useState } from 'react'
import type { Session, Settings } from '../types'
import { playChime } from '../utils/sound'
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
  // If the tab was closed mid-session, that counts as time away, ending now.
  const [state, setState] = useState(() => {
    const saved = loadTimerState() ?? timer.IDLE
    return document.visibilityState === 'visible' ? timer.returnToTab(saved, Date.now()) : saved
  })
  // The time of the last tick. Kept in state so rendering never reads the clock itself.
  const [now, setNow] = useState(() => Date.now())

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
    // Chime when a phase just ended, but not when catching up on one that ended long ago
    const justEnded = state.endsAt !== null && t - state.endsAt < CHIME_WINDOW_MS
    if (settings.sound && transition.state.phase !== state.phase && justEnded) playChime()
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
      const next = timer.leaveTab(state, Date.now())
      setState(next)
      // Save right away: the tab may be closing, and effects won't get another chance to run
      saveTimerState(next)
    },
    () => setState(timer.returnToTab(state, Date.now())),
  )

  // Each action updates `now` too, so the display is right before the next tick arrives
  function act(update: (t: number) => void) {
    const t = Date.now()
    setNow(t)
    update(t)
  }

  return {
    phase: state.phase,
    session: state.session,
    now,
    remainingMs: timer.displayRemainingMs(state, settings, now),
    isPaused: timer.isPaused(state),
    addDistraction: (note: string) => setState(timer.addDistraction(state, Date.now(), note)),
    start: (intention: string) =>
      act((t) => setState(timer.start(settings, t, crypto.randomUUID(), intention))),
    pause: () => act((t) => setState(timer.pause(state, t))),
    resume: () => act((t) => setState(timer.resume(state, t))),
    stop: () => act((t) => apply(timer.stop(state, t))),
  }
}
