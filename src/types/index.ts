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
}

export interface Settings {
  focusMinutes: number
  breakMinutes: number
  sound: boolean
}

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
