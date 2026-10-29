import type {
  CameraStats,
  Distraction,
  Session,
  Detections,
  Sensitivity,
  SessionDraft,
  Settings,
  TimerState,
} from '../types'
import type { Calibration, Pose, StudyMode } from './attention'
import type { PostureMetrics } from './posture'

// The only module that touches localStorage (see docs/PLAN.md and docs/STORAGE.md).
// Saved values are wrapped as { version, data }: older versions are upgraded by MIGRATIONS,
// and anything unreadable is backed up before the app saves over it.

export const STORAGE_VERSION = 1

const KEYS = {
  settings: 'focus-guardian:settings',
  sessions: 'focus-guardian:sessions',
  timer: 'focus-guardian:timer',
  attention: 'focus-guardian:attention',
} as const

export const DEFAULT_SETTINGS: Settings = {
  focusMinutes: 25,
  breakMinutes: 5,
  sound: true,
  detections: { lookingAway: true, phone: true, posture: true, tabLeaves: true },
  sensitivity: 'medium',
}

const SENSITIVITIES: readonly Sensitivity[] = ['low', 'medium', 'high']

/** Allowed whole-minute ranges, shared by loading and the settings form. */
export const MINUTE_LIMITS = {
  focusMinutes: { min: 1, max: 180 },
  breakMinutes: { min: 1, max: 60 },
} as const

export function isValidMinutes(field: keyof typeof MINUTE_LIMITS, value: unknown): value is number {
  const { min, max } = MINUTE_LIMITS[field]
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max
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
    value.distractions.every(isDistraction) &&
    (value.camera === undefined || isCameraStats(value.camera))
  )
}

function isCameraStats(value: unknown): value is CameraStats {
  return (
    isRecord(value) &&
    [
      value.checkedMs,
      value.focusedMs,
      value.phoneMs,
      value.postureCheckedMs,
      value.goodPostureMs,
    ].every(isNonNegativeNumber)
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

/**
 * Upgrades from each older format to the next: `MIGRATIONS[n]` turns version n data into
 * version n + 1. When the saved format changes, bump STORAGE_VERSION and add a step here,
 * so data saved by older versions of the app is upgraded instead of lost.
 */
export type Migration = (data: unknown, key: string) => unknown
const MIGRATIONS: Record<number, Migration> = {}

/**
 * Brings data saved as `version` up to `target`, one step at a time. Undefined if a step
 * is missing or fails, or the data is from a newer version than this app knows.
 */
export function upgrade(
  version: unknown,
  data: unknown,
  key: string,
  migrations: Record<number, Migration> = MIGRATIONS,
  target: number = STORAGE_VERSION,
): unknown {
  if (!Number.isInteger(version) || (version as number) < 1 || (version as number) > target) {
    return undefined
  }
  let current = data
  for (let v = version as number; v < target; v++) {
    const step = migrations[v]
    if (!step) return undefined
    try {
      current = step(current, key)
    } catch {
      return undefined
    }
  }
  return current
}

// Unreadable data is copied here before the app saves over it, so it can be recovered
const BACKUP_PREFIX = 'focus-guardian:backup:'
export const MAX_BACKUPS = 3

/**
 * Keeps a copy of a saved value the app couldn't use (broken JSON, an unknown format, a
 * newer version, entries that didn't pass the checks). Only the newest few are kept, so
 * repeated problems can't fill up storage.
 */
function backUp(key: string, raw: string, reason: string): void {
  try {
    localStorage.setItem(
      `${BACKUP_PREFIX}${Date.now()}:${key}`,
      JSON.stringify({ key, reason, savedAt: Date.now(), raw }),
    )
    const backups: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(BACKUP_PREFIX)) backups.push(k)
    }
    // Keys start with the time, so sorting by the number after the prefix is oldest first
    backups.sort((a, b) => backupTime(a) - backupTime(b))
    for (const old of backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS))) {
      localStorage.removeItem(old)
    }
  } catch {
    // Storage full or blocked: nothing more we can do
  }
}

function backupTime(backupKey: string): number {
  return Number(backupKey.slice(BACKUP_PREFIX.length).split(':')[0]) || 0
}

/** The backups kept so far, newest first (for support or a future "recover" screen). */
export function listBackups(): { key: string; reason: string; savedAt: number; raw: string }[] {
  const found = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith(BACKUP_PREFIX)) continue
      const value: unknown = JSON.parse(localStorage.getItem(k) ?? 'null')
      if (isRecord(value) && typeof value.raw === 'string') {
        found.push({
          key: String(value.key),
          reason: String(value.reason),
          savedAt: Number(value.savedAt),
          raw: value.raw,
        })
      }
    }
  } catch {
    return []
  }
  return found.sort((a, b) => b.savedAt - a.savedAt)
}

interface ReadResult {
  data: unknown // undefined when missing or unusable
  raw: string | null // what was stored, for backing up
}

/**
 * Reads a saved value. Missing data is simply undefined. Data that can't be used (broken
 * JSON, not in the { version, data } format, from a newer app, or failing an upgrade) is
 * backed up first, then reads as undefined, so the app starts fresh without losing it.
 */
function read(key: string): ReadResult {
  let raw: string | null
  try {
    raw = localStorage.getItem(key)
  } catch {
    // Storage blocked (private mode, browser settings): nothing to read or back up
    return { data: undefined, raw: null }
  }
  if (raw === null) return { data: undefined, raw: null }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    backUp(key, raw, 'not valid JSON')
    return { data: undefined, raw }
  }
  if (!isRecord(parsed) || !('version' in parsed) || !('data' in parsed)) {
    backUp(key, raw, 'not in the { version, data } format')
    return { data: undefined, raw }
  }
  const data = upgrade(parsed.version, parsed.data, key)
  if (data === undefined) {
    backUp(key, raw, `can't read version ${String(parsed.version)}`)
    return { data: undefined, raw }
  }
  return { data, raw }
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
  const { data } = read(KEYS.settings)
  if (!isRecord(data)) return { ...DEFAULT_SETTINGS }

  return {
    focusMinutes: isValidMinutes('focusMinutes', data.focusMinutes)
      ? data.focusMinutes
      : DEFAULT_SETTINGS.focusMinutes,
    breakMinutes: isValidMinutes('breakMinutes', data.breakMinutes)
      ? data.breakMinutes
      : DEFAULT_SETTINGS.breakMinutes,
    sound: typeof data.sound === 'boolean' ? data.sound : DEFAULT_SETTINGS.sound,
    // Missing in settings saved before these existed: every check on, medium sensitivity
    detections: loadDetections(data.detections),
    sensitivity: SENSITIVITIES.includes(data.sensitivity as Sensitivity)
      ? (data.sensitivity as Sensitivity)
      : DEFAULT_SETTINGS.sensitivity,
  }
}

/** Each detection switch on its own: a bad or missing one falls back to on. */
function loadDetections(value: unknown): Detections {
  const saved = isRecord(value) ? value : {}
  const pick = (name: keyof Detections) =>
    typeof saved[name] === 'boolean' ? (saved[name] as boolean) : DEFAULT_SETTINGS.detections[name]
  return {
    lookingAway: pick('lookingAway'),
    phone: pick('phone'),
    posture: pick('posture'),
    tabLeaves: pick('tabLeaves'),
  }
}

export function saveSettings(settings: Settings): boolean {
  return write(KEYS.settings, settings)
}

/**
 * Saved session history. Entries that don't match the Session shape are dropped, but the
 * whole saved value is backed up first, so dropped sessions can still be recovered.
 */
export function loadSessions(): Session[] {
  const { data, raw } = read(KEYS.sessions)
  if (data === undefined) return []
  if (!Array.isArray(data)) {
    if (raw !== null) backUp(KEYS.sessions, raw, 'sessions are not a list')
    return []
  }
  const sessions = data.filter(isSession)
  if (sessions.length < data.length && raw !== null) {
    backUp(KEYS.sessions, raw, `${data.length - sessions.length} session(s) failed the checks`)
  }
  return sessions
}

export function saveSessions(sessions: Session[]): boolean {
  return write(KEYS.sessions, sessions)
}

/** The running timer, so a reload or reopened tab picks up where it left off. */
export function loadTimerState(): TimerState | undefined {
  const { data } = read(KEYS.timer)
  return isTimerState(data) ? data : undefined
}

export function saveTimerState(state: TimerState): boolean {
  return write(KEYS.timer, state)
}

/** Camera preferences for the focus check: study mode and calibrated positions. */
export interface AttentionPrefs {
  studyMode: StudyMode
  calibration: Calibration | null
  /** Your calibrated good posture */
  posture: PostureMetrics | null
}

export const DEFAULT_ATTENTION_PREFS: AttentionPrefs = {
  studyMode: 'screen',
  calibration: null,
  posture: null,
}

function isPostureMetrics(value: unknown): value is PostureMetrics {
  return (
    isRecord(value) &&
    [value.headHeight, value.shoulderWidth, value.tiltDeg].every(
      (n) => typeof n === 'number' && Number.isFinite(n),
    ) &&
    (value.shoulderWidth as number) > 0
  )
}

const STUDY_MODES: readonly StudyMode[] = ['screen', 'book', 'mixed']

function isPose(value: unknown): value is Pose {
  return (
    isRecord(value) &&
    typeof value.yawDeg === 'number' &&
    Number.isFinite(value.yawDeg) &&
    typeof value.pitchDeg === 'number' &&
    Number.isFinite(value.pitchDeg)
  )
}

function isCalibration(value: unknown): value is Calibration {
  return isRecord(value) && isPose(value.screen) && (value.book === null || isPose(value.book))
}

export function loadAttentionPrefs(): AttentionPrefs {
  const { data } = read(KEYS.attention)
  if (!isRecord(data)) return { ...DEFAULT_ATTENTION_PREFS }
  return {
    studyMode: STUDY_MODES.includes(data.studyMode as StudyMode)
      ? (data.studyMode as StudyMode)
      : DEFAULT_ATTENTION_PREFS.studyMode,
    calibration: isCalibration(data.calibration) ? data.calibration : null,
    // Missing in prefs saved before posture checks existed: that's just "not calibrated"
    posture: isPostureMetrics(data.posture) ? data.posture : null,
  }
}

export function saveAttentionPrefs(prefs: AttentionPrefs): boolean {
  return write(KEYS.attention, prefs)
}
