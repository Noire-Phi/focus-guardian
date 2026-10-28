# Focus Guardian — Plan

A small browser app that helps you do focused work: you set an intention, start a timed
focus session, and the app notices (and lets you note) when you get distracted. Afterwards
you can see how your day went.

No backend and no accounts. Everything runs in the browser and is saved in `localStorage`.

## Features

**Version 1 (MVP)**

1. **Focus timer**: work sessions (default 25 min) and breaks (default 5 min), with
   start, pause, resume and stop.
2. **Intention**: before starting, you write one line saying what you are working on.
3. **Tab guard**: during a focus session, the app counts each time you leave the tab and
   how long you were gone.
4. **Distraction log**: one button (or a keypress) to quickly note "I got distracted by …"
   without stopping the timer.
5. **Today's summary**: finished sessions, total focus time, and the number of distractions
   for the current day.
6. **Settings**: session/break lengths and the end-of-session sound on/off.

**Later (not in v1)**: weekly history charts, long breaks every 4 sessions, browser
notifications, exporting data.

> **Why this scope:** the timer + tab guard + log is the smallest thing that is actually
> useful and different from a plain Pomodoro timer. Everything else can be added without
> changing the core.

## Architecture

```
src/
├── App.tsx                 Owns the app state (via hooks) and lays out the screen
├── components/
│   ├── IntentionInput.tsx  Text field for "what am I working on?"
│   ├── TimerDisplay.tsx    Shows remaining time and the current phase (focus / break)
│   ├── TimerControls.tsx   Start / pause / resume / stop buttons
│   ├── DistractionLog.tsx  Quick-add box + list of this session's distractions
│   ├── TodaySummary.tsx    Totals for today
│   └── SettingsPanel.tsx   Durations and sound toggle
├── hooks/
│   ├── useFocusTimer.ts    The timer state machine (idle → focus → break → idle)
│   ├── useTabGuard.ts      Listens for the tab being hidden/shown during focus
│   └── useLocalStorage.ts  A useState that also reads/writes localStorage
├── utils/
│   ├── time.ts             formatDuration, startOfToday, …
│   └── storage.ts          Load/save with a version number, safe against bad data
└── types/
    └── index.ts            Session, Distraction, Settings, TimerState
```

**Rule of thumb:** components only display things and report clicks. Hooks hold state and
logic. Utils are plain functions with no React, which makes them easy to test.

### Core data types

```ts
type Phase = 'idle' | 'focus' | 'break'

interface Session {
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

interface Distraction {
  at: number
  note: string
}

interface Settings {
  focusMinutes: number
  breakMinutes: number
  sound: boolean
}
```

## Data flow

State flows one way: **hooks → App → components (as props)**. Components send changes
back up as callbacks (`onStart`, `onAddDistraction`, …).

```
            ┌──────────────── localStorage ────────────────┐
            │  settings            sessions (history)      │
            └──────▲───────────────────────▲───────────────┘
                   │ read/write            │ append when a session ends
            useLocalStorage          useLocalStorage
                   │                       │
 useTabGuard ──► useFocusTimer ◄───────────┘
  (hidden/shown     (phase, endsAt, current session draft)
   events)                │
                          ▼
                       App.tsx
        ┌────────┬────────┼─────────┬──────────────┐
        ▼        ▼        ▼         ▼              ▼
   Intention  Timer    Timer   Distraction    TodaySummary
    Input    Display  Controls     Log      (derived from sessions)
        └────────┴── callbacks back up to App ─────┘
```

One session, step by step:

1. You type an intention and press **Start**. `useFocusTimer` creates a session draft and
   saves `endsAt = now + focusMinutes`.
2. While the focus phase runs, `useTabGuard` adds to `tabLeaves` and `awayMs` on the
   draft. The distraction button adds entries to `distractions`.
3. When time runs out (or you press Stop), the draft becomes a finished `Session` and is
   added to the saved history. The break phase then starts.
4. `TodaySummary` filters the history to today and adds it up. Nothing is stored twice.

## Decisions and why

- **No backend.** A personal focus tool doesn't need one, and this keeps the app fast,
  free to host and private. `storage.ts` is the only place that touches storage, so it
  could be swapped for a server later.
- **Timer stores an end time, not a countdown.** Browsers slow down timers in background
  tabs, so counting down `-1` every second drifts. Saving `endsAt` and computing
  `endsAt - Date.now()` on each tick is always correct, even after a reload.
- **Plain hooks and props, no Redux/Zustand/Context yet.** The app has one screen and one
  owner of state (`App`), so passing props is simple and easy to follow. If prop passing
  gets painful, move the timer into a Context. That's a small change.
- **Summary is derived, not stored.** Today's totals are computed from the session
  history, so they can never get out of sync with it.
- **Versioned storage.** Saved data includes a `version` field so future changes to the
  types can migrate old data instead of crashing on it.
- **Tab guard uses the Page Visibility API** (`visibilitychange`). It works in every
  modern browser without extra permissions. It can't see other apps, only whether this
  tab is visible. That is enough for v1.

## Build order

1. Types + `utils/time.ts` + `utils/storage.ts`
2. `useFocusTimer` with `TimerDisplay` and `TimerControls` (a working timer)
3. `IntentionInput` and saving sessions to history
4. `useTabGuard` and `DistractionLog`
5. `TodaySummary`, then `SettingsPanel`
