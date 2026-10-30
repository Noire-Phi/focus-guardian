// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session, Settings } from '../types'
import { alertCue } from '../utils/alerts'
import { DEFAULT_SETTINGS } from '../utils/storage'
import { useFocusTimer } from './useFocusTimer'

vi.mock('../utils/alerts', () => ({ alertCue: vi.fn() }))

const MIN = 60_000
const START = new Date(2026, 9, 29, 9, 0).getTime()
const settings: Settings = { ...DEFAULT_SETTINGS, sound: false }

function setup(initial: Settings = settings) {
  const onSessionEnd = vi.fn<(session: Session) => void>()
  const hook = renderHook(({ s }) => useFocusTimer(s, onSessionEnd), {
    initialProps: { s: initial },
  })
  return { ...hook, onSessionEnd }
}

/** Lets the hook's 250 ms interval fire once, as a normal (foreground) tick. */
function tick() {
  act(() => {
    vi.advanceTimersByTime(250)
  })
}

/**
 * A background tab: the clock moves on but the interval doesn't fire (browsers throttle
 * timers to about once a minute, or pause them). Then a single late tick arrives.
 */
function timePassesInBackground(ms: number) {
  vi.setSystemTime(Date.now() + ms)
  tick()
}

beforeEach(() => {
  vi.mocked(alertCue).mockClear()
  vi.useFakeTimers()
  vi.setSystemTime(START)
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useFocusTimer', () => {
  it('shows the focus length while idle, and starts a focus session', () => {
    const { result } = setup()
    expect(result.current.phase).toBe('idle')
    expect(result.current.remainingMs).toBe(25 * MIN)

    act(() => result.current.start('Write tests'))
    expect(result.current.phase).toBe('focus')
    expect(result.current.session?.intention).toBe('Write tests')
    expect(result.current.remainingMs).toBe(25 * MIN)
  })

  it('counts down as it ticks', () => {
    const { result } = setup()
    act(() => result.current.start('x'))
    act(() => {
      vi.advanceTimersByTime(10 * MIN)
    })
    expect(result.current.remainingMs).toBe(15 * MIN)
  })

  describe('in a background tab', () => {
    it('stays exact when ticks are throttled', () => {
      const { result } = setup()
      act(() => result.current.start('x'))

      timePassesInBackground(24 * MIN)
      expect(result.current.phase).toBe('focus')
      // 24 min plus the one 250 ms tick that arrived
      expect(result.current.remainingMs).toBe(MIN - 250)
    })

    it('times the break from when focus ended, even if the tick comes late', () => {
      const { result, onSessionEnd } = setup()
      act(() => result.current.start('x'))

      timePassesInBackground(27 * MIN)
      expect(result.current.phase).toBe('break')
      expect(result.current.remainingMs).toBe(3 * MIN - 250)
      expect(onSessionEnd).toHaveBeenCalledTimes(1)
      expect(onSessionEnd.mock.calls[0][0]).toMatchObject({
        completed: true,
        endedAt: START + 25 * MIN,
      })
    })

    it('catches up to idle after a long time away', () => {
      const { result, onSessionEnd } = setup()
      act(() => result.current.start('x'))

      timePassesInBackground(3 * 60 * MIN)
      expect(result.current.phase).toBe('idle')
      expect(onSessionEnd).toHaveBeenCalledTimes(1)
    })
  })

  it('freezes while paused and continues on resume', () => {
    const { result } = setup()
    act(() => result.current.start('x'))
    act(() => {
      vi.advanceTimersByTime(5 * MIN)
    })
    act(() => result.current.pause())
    expect(result.current.isPaused).toBe(true)

    act(() => {
      vi.advanceTimersByTime(60 * MIN)
    })
    timePassesInBackground(60 * MIN)
    expect(result.current.remainingMs).toBe(20 * MIN)

    act(() => result.current.resume())
    act(() => {
      vi.advanceTimersByTime(MIN)
    })
    expect(result.current.remainingMs).toBe(19 * MIN)
  })

  it('reset puts the current phase back to full length', () => {
    const { result } = setup()
    act(() => result.current.start('x'))
    act(() => {
      vi.advanceTimersByTime(10 * MIN)
    })
    act(() => result.current.reset())
    expect(result.current.phase).toBe('focus')
    expect(result.current.remainingMs).toBe(25 * MIN)
  })

  it('skip ends focus early (saved as not completed), then skips the break to idle', () => {
    const { result, onSessionEnd } = setup()
    act(() => result.current.start('x'))
    act(() => {
      vi.advanceTimersByTime(10 * MIN)
    })

    act(() => result.current.skip())
    expect(result.current.phase).toBe('break')
    expect(result.current.remainingMs).toBe(5 * MIN)
    expect(onSessionEnd).toHaveBeenCalledTimes(1)
    expect(onSessionEnd.mock.calls[0][0].completed).toBe(false)

    act(() => result.current.skip())
    expect(result.current.phase).toBe('idle')
    expect(onSessionEnd).toHaveBeenCalledTimes(1)
  })

  it('stop ends the session and saves it as not completed', () => {
    const { result, onSessionEnd } = setup()
    act(() => result.current.start('x'))
    act(() => result.current.stop())
    expect(result.current.phase).toBe('idle')
    expect(onSessionEnd.mock.calls[0][0].completed).toBe(false)
  })

  it('uses the configured lengths', () => {
    const custom = { ...settings, focusMinutes: 50, breakMinutes: 10 }
    const { result } = setup(custom)
    expect(result.current.remainingMs).toBe(50 * MIN)

    act(() => result.current.start('x'))
    timePassesInBackground(51 * MIN)
    expect(result.current.phase).toBe('break')
    expect(result.current.remainingMs).toBe(9 * MIN - 250)
  })

  it('picks up where it left off after a reload', () => {
    const first = setup()
    act(() => first.result.current.start('Survives reload'))
    act(() => {
      vi.advanceTimersByTime(5 * MIN)
    })
    first.unmount()

    vi.setSystemTime(Date.now() + 2 * MIN)
    const second = setup()
    expect(second.result.current.phase).toBe('focus')
    expect(second.result.current.session?.intention).toBe('Survives reload')
    expect(second.result.current.remainingMs).toBe(18 * MIN)
  })

  it('does not count leaving the tab when that check is off in Settings', () => {
    const { result } = setup({
      ...settings,
      detections: { ...settings.detections, tabLeaves: false },
    })
    act(() => result.current.start('x'))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current.session?.tabLeaves).toBe(0)
    vi.restoreAllMocks()
  })

  it('counts leaving the tab during focus', () => {
    const { result } = setup()
    act(() => result.current.start('x'))

    const setVisibility = (state: DocumentVisibilityState) => {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
    }
    setVisibility('hidden')
    vi.setSystemTime(Date.now() + 2 * MIN)
    setVisibility('visible')

    expect(result.current.session?.tabLeaves).toBe(1)
    expect(result.current.session?.awayMs).toBe(2 * MIN)
  })

  describe('when a phase runs out', () => {
    it('alerts and reports which phase ended, until you act', () => {
      const { result } = setup()
      act(() => result.current.start('x'))
      expect(result.current.phaseEnded).toBeNull()

      timePassesInBackground(25 * MIN)
      expect(result.current.phase).toBe('break')
      expect(result.current.phaseEnded).toBe('focus')
      expect(alertCue).toHaveBeenCalledTimes(1)

      timePassesInBackground(5 * MIN)
      expect(result.current.phase).toBe('idle')
      expect(result.current.phaseEnded).toBe('break')
      expect(alertCue).toHaveBeenCalledTimes(2)

      act(() => result.current.start('y'))
      expect(result.current.phaseEnded).toBeNull()
    })

    it('can be dismissed', () => {
      const { result } = setup()
      act(() => result.current.start('x'))
      timePassesInBackground(25 * MIN)
      act(() => result.current.dismissPhaseEnded())
      expect(result.current.phaseEnded).toBeNull()
      expect(result.current.phase).toBe('break')
    })

    it('stays quiet when you skip or stop, or catch up on a phase that ended long ago', () => {
      const { result } = setup()
      act(() => result.current.start('x'))
      act(() => result.current.skip())
      act(() => result.current.stop())
      expect(result.current.phaseEnded).toBeNull()

      act(() => result.current.start('x'))
      timePassesInBackground(3 * 60 * MIN)
      expect(result.current.phaseEnded).toBeNull()
      expect(alertCue).not.toHaveBeenCalled()
    })
  })

  describe('during a session', () => {
    it('adds up camera time sent in batches, including from timers (functional update)', () => {
      const { result } = setup()
      act(() => result.current.start('x'))
      act(() => {
        result.current.recordCamera({ checkedMs: 1000, focusedMs: 800 })
        result.current.recordCamera({ checkedMs: 1000, focusedMs: 1000 })
      })
      expect(result.current.session?.camera).toMatchObject({ checkedMs: 2000, focusedMs: 1800 })
    })

    it('logs distractions with the time and note', () => {
      const { result } = setup()
      act(() => result.current.start('x'))
      vi.setSystemTime(START + 3 * MIN)
      act(() => result.current.addDistraction('phone'))
      expect(result.current.session?.distractions).toEqual([{ at: START + 3 * MIN, note: 'phone' }])
    })

    it('ignores camera time and distractions when no session is running', () => {
      const { result } = setup()
      act(() => {
        result.current.recordCamera({ checkedMs: 1000 })
        result.current.addDistraction('phone')
      })
      expect(result.current.session).toBeNull()
      expect(result.current.phase).toBe('idle')
    })
  })
})
