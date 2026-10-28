import type { Distraction, Session, SessionDraft, Settings, TimerState } from '../types'

// The only module that touches localStorage (see docs/PLAN.md).
// Saved values are wrapped as { version, data } so later type changes can migrate old data.

export const STORAGE_VERSION = 1

const KEYS = {
  settings: 'focus-guardian:settings',
  sessions: 'focus-guardian:sessions',
  timer: 'focus-guardian:timer',
} as const

export const DEFAULT_SETTINGS: Settings = {
  focusMinutes: 25,
  breakMinutes: 5,
  sound: true,
}

interface Stored {
  version: number
  data: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isDistraction(value: unknown): value is Distraction {
  return isRecord(value) && isNonNegativeNumber(value.at) && typeof value.note === 'string'
}

// Fields shared by sessions in progress and finished sessions
function hasSessionFields(value: Record<string, unknown>): boolean {
  return (
    typeof value.id === 'string' &&
    typeof value.intention === 'string' &&
    isNonNegativeNumber(value.startedAt) &&
    isPositiveNumber(value.plannedMinutes) &&
    isNonNegativeNumber(value.tabLeaves) &&
    isNonNegativeNumber(value.awayMs) &&
    Array.isArray(value.distractions) &&
    value.distractions.every(isDistraction)
  )
}

function isSessionDraft(value: unknown): value is SessionDraft {
  return (
    isRecord(value) &&
    hasSessionFields(value) &&
    (value.awaySince === null || isNonNegativeNumber(value.awaySince))
  )
}

function isSession(value: unknown): value is Session {
  return (
    isRecord(value) &&
    hasSessionFields(value) &&
    isNonNegativeNumber(value.endedAt) &&
    typeof value.completed === 'boolean'
  )
}

function isTimerState(value: unknown): value is TimerState {
  if (!isRecord(value)) return false
  const { phase, endsAt, pausedRemainingMs, session } = value
  if (phase === 'idle') return endsAt === null && pausedRemainingMs === null && session === null
  if (phase !== 'focus' && phase !== 'break') return false
  // Only the focus phase carries a session in progress
  const sessionOk = phase === 'focus' ? isSessionDraft(session) : session === null
  // A running or paused phase has exactly one of the two times set
  const timesOk =
    (isNonNegativeNumber(endsAt) && pausedRemainingMs === null) ||
    (endsAt === null && isNonNegativeNumber(pausedRemainingMs))
  return sessionOk && timesOk
}

/** Returns the stored data, or undefined if missing, unreadable or from an unknown version. */
function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return undefined

    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION) return undefined
    return parsed.data
  } catch {
    // localStorage can be blocked (private mode, browser settings) or hold invalid JSON
    return undefined
  }
}

function write(key: string, data: unknown): boolean {
  try {
    const stored: Stored = { version: STORAGE_VERSION, data }
    localStorage.setItem(key, JSON.stringify(stored))
    return true
  } catch {
    // Blocked storage or quota exceeded: the app keeps working, it just won't remember
    return false
  }
}

/** Saved settings, with defaults filled in for anything missing or invalid. */
export function loadSettings(): Settings {
  const data = read(KEYS.settings)
  if (!isRecord(data)) return { ...DEFAULT_SETTINGS }

  return {
    focusMinutes: isPositiveNumber(data.focusMinutes)
      ? data.focusMinutes
      : DEFAULT_SETTINGS.focusMinutes,
    breakMinutes: isPositiveNumber(data.breakMinutes)
      ? data.breakMinutes
      : DEFAULT_SETTINGS.breakMinutes,
    sound: typeof data.sound === 'boolean' ? data.sound : DEFAULT_SETTINGS.sound,
  }
}

export function saveSettings(settings: Settings): boolean {
  return write(KEYS.settings, settings)
}

/** Saved session history. Entries that don't match the Session shape are dropped. */
export function loadSessions(): Session[] {
  const data = read(KEYS.sessions)
  if (!Array.isArray(data)) return []
  return data.filter(isSession)
}

export function saveSessions(sessions: Session[]): boolean {
  return write(KEYS.sessions, sessions)
}

/** The running timer, so a reload or reopened tab picks up where it left off. */
export function loadTimerState(): TimerState | undefined {
  const data = read(KEYS.timer)
  return isTimerState(data) ? data : undefined
}

export function saveTimerState(state: TimerState): boolean {
  return write(KEYS.timer, state)
}
