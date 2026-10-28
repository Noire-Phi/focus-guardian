import { useEffect, useEffectEvent, useState } from 'react'
import type { Session, Settings } from '../types'
import { loadTimerState, saveTimerState } from '../utils/storage'
import * as timer from '../utils/timer'

// How often the clock re-renders. Under a second so the display never skips a second.
const TICK_MS = 250

/**
 * Runs the focus/break timer. The rules live in utils/timer.ts; this hook adds the clock
 * and saving. `onSessionEnd` is called with each focus session when it finishes or is
 * stopped. It can be called twice for the same session (React StrictMode runs effects
 * twice in development), so the receiver should ignore an id it already has.
 */
export function useFocusTimer(settings: Settings, onSessionEnd: (session: Session) => void) {
  // Loaded as saved; the first tick catches up on anything that ended while the app was closed
  const [state, setState] = useState(() => loadTimerState() ?? timer.IDLE)
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
    apply(timer.advance(state, settings, t))
  })

  useEffect(() => {
    saveTimerState(state)
  }, [state])

  useEffect(() => {
    if (!running) return
    const id = setInterval(tick, TICK_MS)
    return () => clearInterval(id)
  }, [running])

  // Each action updates `now` too, so the display is right before the next tick arrives
  function act(update: (t: number) => void) {
    const t = Date.now()
    setNow(t)
    update(t)
  }

  return {
    phase: state.phase,
    intention: state.session?.intention ?? null,
    remainingMs: timer.displayRemainingMs(state, settings, now),
    isPaused: timer.isPaused(state),
    start: (intention: string) =>
      act((t) => setState(timer.start(settings, t, crypto.randomUUID(), intention))),
    pause: () => act((t) => setState(timer.pause(state, t))),
    resume: () => act((t) => setState(timer.resume(state, t))),
    stop: () => act((t) => apply(timer.stop(state, t))),
  }
}
