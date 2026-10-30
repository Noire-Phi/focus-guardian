// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { loadSessions } from './utils/storage'

// The whole app, as you use it: the timer, its alerts, saving, and the dashboard. The camera
// stays off here; its parts are tested on their own.

const MIN = 60_000

beforeEach(() => {
  localStorage.clear()
  document.title = ''
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const session = () => screen.getByRole('region', { name: 'Focus session' })
const button = (name: string) => screen.getByRole('button', { name })

/** Types an intention and presses Enter, as you would to start. */
function startWithEnter(intention = 'Write the essay') {
  const input = screen.getByRole('textbox', { name: 'What are you working on?' })
  fireEvent.change(input, { target: { value: intention } })
  input.focus()
  fireEvent.keyDown(input, { key: 'Enter' })
}

describe('App', () => {
  it('starts a session with Enter and keeps keyboard focus in the session card', () => {
    render(<App />)
    startWithEnter()

    expect(within(session()).getByText('Write the essay')).toBeTruthy()
    // The intention box is gone; focus moved to Pause rather than dropping to the page
    expect(document.activeElement).toBe(button('Pause'))
    expect(document.title).toBe('25:00 Focus · Focus Guardian')
  })

  it('needs something to work on before it starts', () => {
    render(<App />)
    expect((button('Start focus') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: 'What are you working on?' }), {
      target: { value: '   ' },
    })
    expect((button('Start focus') as HTMLButtonElement).disabled).toBe(true)
  })

  it('saves a stopped session, counts it today, and keeps the intention for next time', () => {
    render(<App />)
    startWithEnter('Revise chapter 3')
    button('Stop').focus()
    fireEvent.click(button('Stop'))

    const saved = loadSessions()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ intention: 'Revise chapter 3', completed: false })
    expect(screen.getByText('1 stopped early')).toBeTruthy()

    const input = screen.getByRole('textbox', { name: 'What are you working on?' })
    expect((input as HTMLInputElement).value).toBe('Revise chapter 3')
    // Stop removed itself: focus goes to Start, ready for the next session
    expect(document.activeElement).toBe(button('Start focus'))
  })

  it('logs a distraction during a session and announces it', () => {
    render(<App />)
    startWithEnter()
    fireEvent.change(screen.getByRole('textbox', { name: 'Distraction note' }), {
      target: { value: 'phone' },
    })
    fireEvent.click(button('Log'))
    expect(within(session()).getByText('phone')).toBeTruthy()
    expect(
      screen.getAllByRole('status').some((s) => s.textContent === 'Distraction 1 logged.'),
    ).toBe(true)
  })

  it('when focus runs out: shows, announces and titles the break, until dismissed', () => {
    vi.useFakeTimers()
    render(<App />)
    startWithEnter()

    act(() => {
      vi.advanceTimersByTime(25 * MIN + 500)
    })
    expect(screen.getByText('Focus session done')).toBeTruthy()
    expect(
      screen
        .getAllByRole('status')
        .some((s) => s.textContent === 'Focus session done. Time for a 5-minute break.'),
    ).toBe(true)
    // Half a second into the break; the clock rounds up
    expect(document.title).toBe('5:00 Break · Focus Guardian')
    expect(loadSessions()[0]).toMatchObject({ completed: true })

    button('Dismiss').focus()
    fireEvent.click(button('Dismiss'))
    expect(screen.queryByText('Focus session done')).toBeNull()
    expect(document.activeElement).toBe(button('Pause'))
  })

  it('from the empty dashboard, "Start a focus session" goes to the intention box', async () => {
    render(<App />)
    fireEvent.click(button('Dashboard'))
    expect(button('Dashboard').getAttribute('aria-pressed')).toBe('true')
    // The dashboard is loaded on first use
    fireEvent.click(await screen.findByRole('button', { name: 'Start a focus session' }))

    expect(button('Timer').getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'What are you working on?' }),
    )
  })

  it('keeps the timer running while the dashboard is open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<App />)
    startWithEnter()
    fireEvent.click(button('Dashboard'))
    act(() => {
      vi.advanceTimersByTime(5 * MIN)
    })
    expect(document.title).toMatch(/^20:00 Focus/)
  })
})
