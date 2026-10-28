import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session, Settings } from '../types'
import {
  DEFAULT_ATTENTION_PREFS,
  DEFAULT_SETTINGS,
  loadAttentionPrefs,
  saveAttentionPrefs,
  isValidMinutes,
  loadSessions,
  loadSettings,
  loadTimerState,
  saveSessions,
  saveSettings,
  saveTimerState,
} from './storage'
import * as timer from './timer'

// A small in-memory localStorage; `blocked` makes every call throw, like a locked-down browser
let store: Map<string, string>
let blocked: boolean

beforeEach(() => {
  store = new Map()
  blocked = false
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => {
      if (blocked) throw new Error('blocked')
      return store.get(key) ?? null
    },
    setItem: (key: string, value: string) => {
      if (blocked) throw new Error('blocked')
      store.set(key, value)
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function putRaw(key: string, data: unknown, version = 1) {
  store.set(`focus-guardian:${key}`, JSON.stringify({ version, data }))
}

const settings: Settings = { focusMinutes: 25, breakMinutes: 5, sound: true }
const focus = timer.start(settings, 0, 'id-1', 'Write tests')
const finished: Session = timer.stop(focus, 60_000).finished as Session

describe('settings', () => {
  it('uses the defaults when nothing is saved', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('round-trips saved settings', () => {
    expect(saveSettings({ focusMinutes: 50, breakMinutes: 10, sound: false })).toBe(true)
    expect(loadSettings()).toEqual({ focusMinutes: 50, breakMinutes: 10, sound: false })
  })

  it('keeps valid fields and replaces invalid ones with defaults', () => {
    putRaw('settings', { focusMinutes: 999, breakMinutes: 15, sound: 'yes' })
    expect(loadSettings()).toEqual({ focusMinutes: 25, breakMinutes: 15, sound: true })
  })

  it('uses the defaults for broken JSON or an unknown version', () => {
    store.set('focus-guardian:settings', '{not json')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)

    putRaw('settings', { focusMinutes: 50, breakMinutes: 10, sound: false }, 99)
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })
})

describe('isValidMinutes', () => {
  it('accepts whole minutes within the limits', () => {
    expect(isValidMinutes('focusMinutes', 1)).toBe(true)
    expect(isValidMinutes('focusMinutes', 180)).toBe(true)
    expect(isValidMinutes('breakMinutes', 60)).toBe(true)
  })

  it('rejects out-of-range, fractional and non-number values', () => {
    expect(isValidMinutes('focusMinutes', 0)).toBe(false)
    expect(isValidMinutes('focusMinutes', 181)).toBe(false)
    expect(isValidMinutes('focusMinutes', 2.5)).toBe(false)
    expect(isValidMinutes('breakMinutes', 61)).toBe(false)
    expect(isValidMinutes('breakMinutes', '5')).toBe(false)
  })
})

describe('sessions', () => {
  it('is empty when nothing is saved', () => {
    expect(loadSessions()).toEqual([])
  })

  it('round-trips finished sessions', () => {
    saveSessions([finished])
    expect(loadSessions()).toEqual([finished])
  })

  it('drops entries that are not valid sessions', () => {
    const wrongId = { ...finished, id: 7 }
    const badDistraction = { ...finished, distractions: [{ at: 'x' }] }
    const notBoolean = { ...finished, completed: 'yes' }
    putRaw('sessions', [finished, wrongId, badDistraction, notBoolean, focus.session])
    expect(loadSessions()).toEqual([finished])
  })
})

describe('timer state', () => {
  it('is undefined when nothing is saved', () => {
    expect(loadTimerState()).toBeUndefined()
  })

  it('round-trips running, paused, away and break states', () => {
    const states = [
      focus,
      timer.pause(focus, 60_000),
      timer.leaveTab(focus, 7),
      timer.advance(focus, settings, 25 * 60_000 + 1).state,
      timer.IDLE,
    ]
    for (const state of states) {
      saveTimerState(state)
      expect(loadTimerState()).toEqual(state)
    }
  })

  it('rejects inconsistent shapes', () => {
    const onBreak = timer.advance(focus, settings, 25 * 60_000 + 1).state
    const draftWithoutAwaySince: Record<string, unknown> = { ...focus.session }
    delete draftWithoutAwaySince.awaySince
    const invalid = [
      { ...focus, session: null }, // focus without a session
      { ...onBreak, session: focus.session }, // break with a session
      { ...focus, endsAt: 5, pausedRemainingMs: 5 }, // both times set
      { ...timer.IDLE, phase: 'nap' },
      { ...focus, session: draftWithoutAwaySince }, // saved before the tab guard existed
    ]
    for (const data of invalid) {
      putRaw('timer', data)
      expect(loadTimerState()).toBeUndefined()
    }
  })
})

describe('attention prefs', () => {
  it('defaults to Screen mode with no calibration', () => {
    expect(loadAttentionPrefs()).toEqual(DEFAULT_ATTENTION_PREFS)
  })

  it('round-trips a study mode and calibration', () => {
    const prefs = {
      studyMode: 'mixed' as const,
      calibration: { screen: { yawDeg: 1, pitchDeg: -5 }, book: { yawDeg: 0, pitchDeg: -40 } },
    }
    saveAttentionPrefs(prefs)
    expect(loadAttentionPrefs()).toEqual(prefs)
  })

  it('keeps a screen-only calibration', () => {
    const prefs = {
      studyMode: 'screen' as const,
      calibration: { screen: { yawDeg: 1, pitchDeg: -5 }, book: null },
    }
    saveAttentionPrefs(prefs)
    expect(loadAttentionPrefs()).toEqual(prefs)
  })

  it('drops an unknown mode or a broken calibration', () => {
    putRaw('attention', { studyMode: 'sleep', calibration: { screen: { yawDeg: 'x' } } })
    expect(loadAttentionPrefs()).toEqual(DEFAULT_ATTENTION_PREFS)
  })
})

describe('blocked storage', () => {
  it('falls back to defaults and reports failed saves instead of throwing', () => {
    blocked = true
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
    expect(loadSessions()).toEqual([])
    expect(loadTimerState()).toBeUndefined()
    expect(saveSessions([finished])).toBe(false)
  })
})
