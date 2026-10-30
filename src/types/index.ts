export type Phase = 'idle' | 'focus' | 'break'

export interface Distraction {
  at: number // ms timestamp
  note: string
}

export interface Session {
  id: string
  intention: string
  startedAt: number // ms timestamp
  endedAt: number
  plannedMinutes: number
  completed: boolean // false if stopped early
  tabLeaves: number
  awayMs: number // total time spent away from the tab
  distractions: Distraction[]
  /** What the camera saw, if it was on; missing for sessions without the camera */
  camera?: CameraStats
}

/**
 * Time the camera spent on each thing during a focus session, in milliseconds. The
 * focus score is worked out from these (utils/focusScore.ts).
 */
export interface CameraStats {
  checkedMs: number // time the focus check was watching you
  focusedMs: number // …of which you were on task (screen, book, as the study mode says)
  phoneMs: number // …of which a phone was confirmed
  postureCheckedMs: number // time posture was checked and your shoulders were visible
  goodPostureMs: number // …of which your posture was good
}

export interface Settings {
  focusMinutes: number
  breakMinutes: number
  sound: boolean
  /** Flash the edges of the window with each alert: a visual alternative to the sound */
  flash: boolean
  /** Press D to jump to the distraction note (single-key shortcuts can be turned off) */
  shortcut: boolean
  /** Which checks run during a focus session */
  detections: Detections
  /** How readily the checks flag a distraction (see utils/sensitivity.ts) */
  sensitivity: Sensitivity
  /** Light or dark, or follow the system */
  theme: Theme
}

export type Theme = 'system' | 'light' | 'dark'

export interface Detections {
  lookingAway: boolean // camera: looking away from your screen or book
  phone: boolean // camera: a phone in view
  posture: boolean // camera: slouching or leaning (needs posture calibration)
  tabLeaves: boolean // leaving this browser tab
}

export type Sensitivity = 'low' | 'medium' | 'high'

// A focus session still in progress: everything except how it ended.
// awaySince is when you left the tab, while you're away; otherwise null.
export type SessionDraft = Omit<Session, 'endedAt' | 'completed'> & {
  awaySince: number | null
}

// The timer stores when the phase ends, not a ticking countdown (see docs/PLAN.md).
// While paused, endsAt is null and pausedRemainingMs holds the time that was left.
// `session` is set only during the focus phase.
export interface TimerState {
  phase: Phase
  endsAt: number | null
  pausedRemainingMs: number | null
  session: SessionDraft | null
}
