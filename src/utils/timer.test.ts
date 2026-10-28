import { describe, expect, it } from 'vitest'
import type { Settings, TimerState } from '../types'
import * as timer from './timer'

const MIN = 60_000
const settings: Settings = { focusMinutes: 25, breakMinutes: 5, sound: true }

// A focus session started at time 0, so it ends at 25 minutes
const focus = timer.start(settings, 0, 'id-1', 'Write tests')
const FOCUS_END = 25 * MIN

describe('start', () => {
  it('begins a focus session with an empty draft', () => {
    expect(focus).toEqual({
      phase: 'focus',
      endsAt: FOCUS_END,
      pausedRemainingMs: null,
      session: {
        id: 'id-1',
        intention: 'Write tests',
        startedAt: 0,
        plannedMinutes: 25,
        tabLeaves: 0,
        awayMs: 0,
        distractions: [],
        awaySince: null,
      },
    })
  })
})

describe('pause and resume', () => {
  const paused = timer.pause(focus, 10 * MIN)

  it('keeps the remaining time while paused', () => {
    expect(timer.isPaused(paused)).toBe(true)
    expect(timer.isRunning(paused)).toBe(false)
    expect(timer.displayRemainingMs(paused, settings, 999 * MIN)).toBe(15 * MIN)
  })

  it('does not advance while paused', () => {
    expect(timer.advance(paused, settings, 999 * MIN).state).toBe(paused)
  })

  it('resumes with the same time left', () => {
    const resumed = timer.resume(paused, 100 * MIN)
    expect(resumed.endsAt).toBe(115 * MIN)
    expect(resumed.session).toEqual(focus.session)
  })

  it('ignores pausing twice or resuming a running timer', () => {
    expect(timer.pause(paused, 0)).toBe(paused)
    expect(timer.resume(focus, 0)).toBe(focus)
  })
})

describe('advance', () => {
  it('changes nothing before the end', () => {
    const result = timer.advance(focus, settings, FOCUS_END - 1)
    expect(result.state).toBe(focus)
    expect(result.finished).toBeNull()
  })

  it('starts a break timed from when focus ended, not from now', () => {
    const { state, finished } = timer.advance(focus, settings, FOCUS_END + 2 * MIN)
    expect(state).toEqual({
      phase: 'break',
      endsAt: FOCUS_END + 5 * MIN,
      pausedRemainingMs: null,
      session: null,
    })
    expect(finished).toMatchObject({ id: 'id-1', endedAt: FOCUS_END, completed: true })
  })

  it('catches up through the break to idle after a long time away', () => {
    const { state, finished } = timer.advance(focus, settings, FOCUS_END + 60 * MIN)
    expect(state).toEqual(timer.IDLE)
    expect(finished?.completed).toBe(true)
  })

  it('finishes no session when a break ends', () => {
    const onBreak = timer.advance(focus, settings, FOCUS_END + 1).state
    expect(timer.advance(onBreak, settings, FOCUS_END + 60 * MIN).finished).toBeNull()
  })
})

describe('stop', () => {
  it('saves a focus session as not completed', () => {
    const { state, finished } = timer.stop(focus, 3 * MIN)
    expect(state).toEqual(timer.IDLE)
    expect(finished).toMatchObject({ endedAt: 3 * MIN, completed: false })
    expect(finished).not.toHaveProperty('awaySince')
  })

  it('finishes nothing during a break or when idle', () => {
    const onBreak = timer.advance(focus, settings, FOCUS_END + 1).state
    expect(timer.stop(onBreak, 0).finished).toBeNull()
    expect(timer.stop(timer.IDLE, 0).finished).toBeNull()
  })
})

describe('tab guard', () => {
  it('counts a leave once and adds the time away on return', () => {
    let state = timer.leaveTab(focus, 1 * MIN)
    expect(state.session).toMatchObject({ tabLeaves: 1, awaySince: 1 * MIN })
    expect(timer.leaveTab(state, 2 * MIN)).toBe(state)

    state = timer.returnToTab(state, 3 * MIN)
    expect(state.session).toMatchObject({ tabLeaves: 1, awayMs: 2 * MIN, awaySince: null })
    expect(timer.returnToTab(state, 4 * MIN)).toBe(state)
  })

  it('ignores leaving while paused, on a break or idle', () => {
    const paused = timer.pause(focus, MIN)
    const onBreak = timer.advance(focus, settings, FOCUS_END + 1).state
    for (const state of [paused, onBreak, timer.IDLE]) {
      expect(timer.leaveTab(state, FOCUS_END + 2)).toBe(state)
    }
  })

  it('counts time away only up to the end of the session', () => {
    const away = timer.leaveTab(focus, 20 * MIN)

    // Still away when time runs out
    expect(timer.advance(away, settings, FOCUS_END + 10 * MIN).finished?.awayMs).toBe(5 * MIN)

    // Coming back (or reloading) after the end
    const back = timer.returnToTab(away, FOCUS_END + 10 * MIN)
    expect(back.session?.awayMs).toBe(5 * MIN)
  })

  it('counts time away up to a stop', () => {
    const away = timer.leaveTab(focus, 2 * MIN)
    expect(timer.stop(away, 4 * MIN).finished?.awayMs).toBe(2 * MIN)
  })
})

describe('addDistraction', () => {
  it('appends to the session in order and is kept when it finishes', () => {
    let state = timer.addDistraction(focus, 1000, 'phone')
    state = timer.addDistraction(state, 2000, '')
    expect(state.session?.distractions).toEqual([
      { at: 1000, note: 'phone' },
      { at: 2000, note: '' },
    ])
    expect(timer.stop(state, 3000).finished?.distractions).toHaveLength(2)
  })

  it('works while focus is paused, but not on a break or idle', () => {
    const paused = timer.pause(focus, MIN)
    expect(timer.addDistraction(paused, 5, 'x').session?.distractions).toHaveLength(1)

    const onBreak: TimerState = timer.advance(focus, settings, FOCUS_END + 1).state
    expect(timer.addDistraction(onBreak, 0, 'x')).toBe(onBreak)
    expect(timer.addDistraction(timer.IDLE, 0, 'x')).toBe(timer.IDLE)
  })
})

it('shows the next focus length while idle', () => {
  expect(timer.displayRemainingMs(timer.IDLE, settings, 0)).toBe(25 * MIN)
})
