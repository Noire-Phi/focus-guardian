// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '../types'
import { Dashboard } from './Dashboard'

// jsdom can't draw on a canvas, so Chart.js is replaced by a fake that records each chart
const charts = vi.hoisted(() => ({ created: [] as { type: string; data: unknown }[] }))
vi.mock('chart.js', () => {
  class Chart {
    static register() {}
    static defaults = { color: '', font: { family: '' } }
    constructor(_canvas: unknown, config: { type: string; data: unknown }) {
      charts.created.push(config)
    }
    destroy() {}
  }
  const part = {}
  return {
    Chart,
    BarController: part,
    BarElement: part,
    LineController: part,
    LineElement: part,
    PointElement: part,
    CategoryScale: part,
    LinearScale: part,
    Tooltip: part,
    Legend: part,
    Filler: part,
  }
})

const MIN = 60_000
const NOW = new Date(2026, 9, 29, 18).getTime()

const session = (overrides: Partial<Session> = {}): Session => ({
  id: 's1',
  intention: 'study',
  startedAt: NOW - 3 * 60 * MIN,
  endedAt: NOW - 3 * 60 * MIN + 25 * MIN,
  plannedMinutes: 25,
  completed: true,
  tabLeaves: 2,
  awayMs: 0,
  distractions: [{ at: NOW, note: 'Phone' }],
  ...overrides,
})

beforeEach(() => {
  charts.created = []
  vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, removeEventListener() {} }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Dashboard', () => {
  it('shows a friendly empty state before the first session, with a way to start one', () => {
    const onGoToTimer = vi.fn()
    render(<Dashboard sessions={[]} now={NOW} onGoToTimer={onGoToTimer} />)
    expect(screen.getByText('Your progress will show up here')).toBeTruthy()
    expect(charts.created).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Start a focus session' }))
    expect(onGoToTimer).toHaveBeenCalled()
  })

  it('shows totals and charts once there are sessions', () => {
    const camera = {
      checkedMs: 25 * MIN,
      focusedMs: 25 * MIN,
      phoneMs: 0,
      postureCheckedMs: 0,
      goodPostureMs: 0,
    }
    render(<Dashboard sessions={[session({ camera })]} now={NOW} onGoToTimer={() => {}} />)

    expect(screen.getByText('Total study time').nextElementSibling?.textContent).toBe('25m')
    expect(screen.getByText('Focus score this week').nextElementSibling?.textContent).toBe('100%')
    // Daily scores (bar), weekly trend (line), distractions (bar)
    expect(charts.created.map((c) => c.type)).toEqual(['bar', 'line', 'bar'])
    const distractions = charts.created[2].data as { labels: string[] }
    expect(distractions.labels).toEqual(['Left the tab', 'Phone'])
  })

  it('explains a missing chart instead of drawing an empty one', () => {
    render(
      <Dashboard
        sessions={[session({ tabLeaves: 0, distractions: [] })]}
        now={NOW}
        onGoToTimer={() => {}}
      />,
    )
    expect(screen.getByText(/Turn on the camera during a focus session/)).toBeTruthy()
    expect(screen.getByText(/No distractions logged yet/)).toBeTruthy()
    // Only the weekly trend has something to draw
    expect(charts.created.map((c) => c.type)).toEqual(['line'])
  })

  it('gives each chart a text description for screen readers', () => {
    const camera = {
      checkedMs: 25 * MIN,
      focusedMs: 25 * MIN,
      phoneMs: 0,
      postureCheckedMs: 0,
      goodPostureMs: 0,
    }
    render(<Dashboard sessions={[session({ camera })]} now={NOW} onGoToTimer={() => {}} />)
    const labels = screen.getAllByRole('img').map((el) => el.getAttribute('aria-label'))
    expect(labels[0]).toMatch(/^Daily focus score, last 7 days: .*100%/)
    expect(labels[2]).toMatch(/Left the tab 2 times, Phone 1 time$/)
  })
})
