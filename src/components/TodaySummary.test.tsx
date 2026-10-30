// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DaySummary } from '../utils/stats'
import { TodaySummary } from './TodaySummary'

afterEach(cleanup)

const DAY: DaySummary = {
  started: 3,
  completed: 2,
  focusMs: 50 * 60_000,
  distractions: 4,
  tabLeaves: 1,
  focusScore: 82,
  lastScore: 75,
}

/** The value and detail shown for one stat, by its label. */
function stat(label: string) {
  return screen.getByText(label).closest('div')?.querySelector('dd')?.textContent
}

describe('TodaySummary', () => {
  it('says so when there are no sessions yet', () => {
    render(<TodaySummary summary={{ ...DAY, started: 0, completed: 0 }} />)
    expect(screen.getByText('No sessions yet today.')).toBeTruthy()
    expect(screen.queryByText('Focus score')).toBeNull()
  })

  it('shows the day, with sessions stopped early and the last score', () => {
    render(<TodaySummary summary={DAY} />)
    expect(stat('Focus score')).toBe('82%last session 75%')
    expect(stat('Sessions')).toBe('21 stopped early')
    expect(stat('Focus time')).toBe('50m')
    expect(stat('Distractions')).toBe('4logged')
    expect(stat('Tab leaves')).toBe('1')
  })

  it('explains how to get a focus score when there is none', () => {
    render(<TodaySummary summary={{ ...DAY, focusScore: null, lastScore: null }} />)
    expect(stat('Focus score')).toBe('—turn on the camera during a session to get one')
  })

  it('leaves out "stopped early" when every session was finished', () => {
    render(<TodaySummary summary={{ ...DAY, started: 2 }} />)
    expect(stat('Sessions')).toBe('2')
  })
})
