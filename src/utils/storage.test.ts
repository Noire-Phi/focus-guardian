import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session, Settings } from '../types'
import {
  DEFAULT_ATTENTION_PREFS,
  DEFAULT_SETTINGS,
  MAX_BACKUPS,
  STORAGE_VERSION,
  listBackups,
  upgrade,
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
    removeItem: (key: string) => {
      if (blocked) throw new Error('blocked')
      store.delete(key)
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  })
})

const backupKeys = () => [...store.keys()].filter((k) => k.startsWith('focus-guardian:backup:'))

afterEach(() => {
  vi.unstubAllGlobals()
})

function putRaw(key: string, data: unknown, version = 1) {
  store.set(`focus-guardian:${key}`, JSON.stringify({ version, data }))
}

const settings: Settings = DEFAULT_SETTINGS
const focus = timer.start(settings, 0, 'id-1', 'Write tests')
const finished: Session = timer.stop(focus, 60_000).finished as Session

describe('settings', () => {
  it('uses the defaults when nothing is saved', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('round-trips saved settings', () => {
    const custom: Settings = {
      focusMinutes: 50,
      breakMinutes: 10,
      sound: false,
      detections: { lookingAway: true, phone: false, posture: false, tabLeaves: true },
      sensitivity: 'high',
    }
    expect(saveSettings(custom)).toBe(true)
    expect(loadSettings()).toEqual(custom)
  })

  it('keeps valid fields and replaces invalid ones with defaults', () => {
    putRaw('settings', { focusMinutes: 999, breakMinutes: 15, sound: 'yes' })
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, breakMinutes: 15 })
  })

  it('uses the defaults for broken JSON or an unknown version', () => {
    store.set('focus-guardian:settings', '{not json')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)

    putRaw('settings', { focusMinutes: 50, breakMinutes: 10, sound: false }, 99)
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })
})

describe('detection and sensitivity settings', () => {
  it('reads settings saved before these existed: every check on, medium', () => {
    putRaw('settings', { focusMinutes: 50, breakMinutes: 10, sound: false })
    expect(loadSettings()).toEqual({
      focusMinutes: 50,
      breakMinutes: 10,
      sound: false,
      detections: { lookingAway: true, phone: true, posture: true, tabLeaves: true },
      sensitivity: 'medium',
    })
  })

  it('keeps valid switches and turns bad ones back on, one by one', () => {
    putRaw('settings', {
      ...DEFAULT_SETTINGS,
      detections: { lookingAway: false, phone: 'off', posture: false },
      sensitivity: 'extreme',
    })
    const loaded = loadSettings()
    expect(loaded.detections).toEqual({
      lookingAway: false,
      phone: true,
      posture: false,
      tabLeaves: true,
    })
    expect(loaded.sensitivity).toBe('medium')
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
  it('round-trips camera stats, and older sessions without them', () => {
    const camera = { checkedMs: 1, focusedMs: 1, phoneMs: 0, postureCheckedMs: 0, goodPostureMs: 0 }
    saveSessions([{ ...finished, camera }, finished])
    expect(loadSessions()).toEqual([{ ...finished, camera }, finished])
  })

  it('drops a session with broken camera stats', () => {
    putRaw('sessions', [{ ...finished, camera: { checkedMs: -1 } }])
    expect(loadSessions()).toEqual([])
  })

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
      posture: { headHeight: 0.9, shoulderWidth: 0.35, tiltDeg: 1 },
    }
    saveAttentionPrefs(prefs)
    expect(loadAttentionPrefs()).toEqual(prefs)
  })

  it('keeps a screen-only calibration', () => {
    const prefs = {
      studyMode: 'screen' as const,
      calibration: { screen: { yawDeg: 1, pitchDeg: -5 }, book: null },
      posture: null,
    }
    saveAttentionPrefs(prefs)
    expect(loadAttentionPrefs()).toEqual(prefs)
  })

  it('reads prefs saved before posture checks existed', () => {
    putRaw('attention', { studyMode: 'book', calibration: null })
    expect(loadAttentionPrefs()).toEqual({ studyMode: 'book', calibration: null, posture: null })
  })

  it('drops a broken posture baseline', () => {
    putRaw('attention', {
      studyMode: 'screen',
      calibration: null,
      posture: { headHeight: 1, shoulderWidth: 0, tiltDeg: 0 },
    })
    expect(loadAttentionPrefs().posture).toBeNull()
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

describe('saving each session', () => {
  it('saves in the versioned { version, data } format', () => {
    saveSessions([finished])
    expect(JSON.parse(store.get('focus-guardian:sessions')!)).toEqual({
      version: STORAGE_VERSION,
      data: [finished],
    })
  })

  it('keeps every session as history grows, one save per finished session', () => {
    const second = { ...finished, id: 'id-2', intention: 'Second' }
    saveSessions([finished])
    saveSessions([...loadSessions(), second])
    expect(loadSessions()).toEqual([finished, second])
  })
})

describe('missing or corrupted data', () => {
  it('missing data reads as empty, without a backup', () => {
    expect(loadSessions()).toEqual([])
    expect(backupKeys()).toEqual([])
  })

  it('broken JSON reads as empty and is backed up before anything overwrites it', () => {
    store.set('focus-guardian:sessions', '{"version":1,"data":[{"id":')
    expect(loadSessions()).toEqual([])

    // The app then saves over it (e.g. the next finished session)...
    saveSessions([finished])
    // ...but the broken value is still there to recover
    expect(listBackups()).toEqual([
      expect.objectContaining({
        key: 'focus-guardian:sessions',
        reason: 'not valid JSON',
        raw: '{"version":1,"data":[{"id":',
      }),
    ])
  })

  it('data not in the { version, data } format is backed up', () => {
    store.set('focus-guardian:sessions', JSON.stringify([finished])) // no wrapper
    expect(loadSessions()).toEqual([])
    expect(listBackups()[0].reason).toMatch(/format/)
  })

  it('sessions that are not a list are backed up', () => {
    putRaw('sessions', { not: 'a list' })
    expect(loadSessions()).toEqual([])
    expect(listBackups()[0].reason).toMatch(/not a list/)
  })

  it('keeps the good sessions when some are broken, and backs up the whole value', () => {
    putRaw('sessions', [finished, { ...finished, id: 7 }, 'junk'])
    expect(loadSessions()).toEqual([finished])
    const [backup] = listBackups()
    expect(backup.reason).toBe('2 session(s) failed the checks')
    expect(JSON.parse(backup.raw).data).toHaveLength(3)
  })

  it('does not back up data that loads cleanly', () => {
    saveSessions([finished])
    loadSessions()
    expect(backupKeys()).toEqual([])
  })

  it('keeps only the newest few backups', () => {
    vi.useFakeTimers()
    for (let i = 0; i < MAX_BACKUPS + 2; i++) {
      vi.setSystemTime(1_000_000 + i * 1000)
      store.set('focus-guardian:sessions', `broken ${i}`)
      loadSessions()
    }
    vi.useRealTimers()
    expect(backupKeys()).toHaveLength(MAX_BACKUPS)
    expect(listBackups().map((b) => b.raw)).toEqual(['broken 4', 'broken 3', 'broken 2'])
  })

  it('never throws when storage is blocked, even while backing up', () => {
    store.set('focus-guardian:sessions', 'broken')
    blocked = true
    expect(() => loadSessions()).not.toThrow()
    expect(listBackups()).toEqual([])
  })

  it('other saved values get the same protection', () => {
    store.set('focus-guardian:settings', '{oops')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
    expect(listBackups()[0].key).toBe('focus-guardian:settings')
  })
})

describe('versions', () => {
  it('data from a newer version of the app is backed up, not used or lost', () => {
    putRaw('sessions', [finished], STORAGE_VERSION + 1)
    expect(loadSessions()).toEqual([])
    expect(listBackups()[0].reason).toBe(`can't read version ${STORAGE_VERSION + 1}`)
  })

  it('a version that is not a positive whole number is backed up', () => {
    for (const version of [0, -1, 1.5, '1', null]) {
      store.clear()
      store.set('focus-guardian:sessions', JSON.stringify({ version, data: [finished] }))
      expect(loadSessions()).toEqual([])
      expect(backupKeys()).toHaveLength(1)
    }
  })

  describe('upgrade', () => {
    // Pretend the format is at version 3, with steps from 1 to 2 and 2 to 3
    const migrations = {
      1: (data: unknown) => ({ items: data }), // v1 was a bare list
      2: (data: unknown) => ({ ...(data as object), upgraded: true }),
    }

    it('runs each step from the saved version up to the current one', () => {
      expect(upgrade(1, ['a'], 'k', migrations, 3)).toEqual({ items: ['a'], upgraded: true })
      expect(upgrade(2, { items: [] }, 'k', migrations, 3)).toEqual({ items: [], upgraded: true })
    })

    it('leaves current data alone', () => {
      const data = { items: [] }
      expect(upgrade(3, data, 'k', migrations, 3)).toBe(data)
    })

    it('gives up if a step is missing, fails, or the version is newer', () => {
      expect(upgrade(1, [], 'k', { 2: migrations[2] }, 3)).toBeUndefined()
      const failing = {
        ...migrations,
        2: () => {
          throw new Error('bad data')
        },
      }
      expect(upgrade(1, [], 'k', failing, 3)).toBeUndefined()
      expect(upgrade(4, [], 'k', migrations, 3)).toBeUndefined()
    })

    it('with the real (empty) migration list, only the current version is readable', () => {
      expect(upgrade(STORAGE_VERSION, [1], 'k')).toEqual([1])
      expect(upgrade(STORAGE_VERSION - 1, [1], 'k')).toBeUndefined()
    })
  })
})
