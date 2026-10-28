import { useEffect, useState } from 'react'
import type { Settings } from '../types'
import { loadTimerState, saveTimerState } from '../utils/storage'
import * as timer from '../utils/timer'

// How often the clock re-renders. Under a second so the display never skips a second.
const TICK_MS = 250

/** Runs the focus/break timer. The rules live in utils/timer.ts; this hook adds the clock and saving. */
export function useFocusTimer(settings: Settings) {
  const [state, setState] = useState(() =>
    timer.advance(loadTimerState() ?? timer.IDLE, settings, Date.now()),
  )
  // The time of the last tick. Kept in state so rendering never reads the clock itself.
  const [now, setNow] = useState(() => Date.now())

  const running = timer.isRunning(state)

  useEffect(() => {
    saveTimerState(state)
  }, [state])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      setState((s) => timer.advance(s, settings, t))
    }, TICK_MS)
    return () => clearInterval(id)
  }, [running, settings])

  // Each action updates `now` too, so the display is right before the next tick arrives
  function act(update: (t: number) => void) {
    const t = Date.now()
    setNow(t)
    update(t)
  }

  return {
    phase: state.phase,
    remainingMs: timer.displayRemainingMs(state, settings, now),
    isPaused: timer.isPaused(state),
    start: () => act((t) => setState(timer.start(settings, t))),
    pause: () => act((t) => setState((s) => timer.pause(s, t))),
    resume: () => act((t) => setState((s) => timer.resume(s, t))),
    stop: () => act(() => setState(timer.IDLE)),
  }
}
