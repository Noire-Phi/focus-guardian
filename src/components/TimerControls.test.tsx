// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Phase } from '../types'
import { TimerControls } from './TimerControls'

afterEach(cleanup)

function setup(phase: Phase, { isPaused = false, canStart = true } = {}) {
  const handlers = {
    onStart: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onReset: vi.fn(),
    onSkip: vi.fn(),
    onStop: vi.fn(),
  }
  render(<TimerControls phase={phase} isPaused={isPaused} canStart={canStart} {...handlers} />)
  const names = screen.getAllByRole('button').map((b) => b.textContent)
  return { handlers, names }
}

describe('TimerControls', () => {
  it('offers only Start while idle, disabled until there is something to work on', () => {
    expect(setup('idle').names).toEqual(['Start focus'])
    cleanup()
    const { handlers } = setup('idle', { canStart: false })
    const start = screen.getByRole('button', { name: 'Start focus' }) as HTMLButtonElement
    expect(start.disabled).toBe(true)
    fireEvent.click(start)
    expect(handlers.onStart).not.toHaveBeenCalled()
  })

  it('during focus: pause, reset, skip to break, stop', () => {
    const { names, handlers } = setup('focus')
    expect(names).toEqual(['Pause', 'Reset', 'Skip to break', 'Stop'])
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip to break' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(handlers.onPause).toHaveBeenCalledOnce()
    expect(handlers.onSkip).toHaveBeenCalledOnce()
    expect(handlers.onStop).toHaveBeenCalledOnce()
  })

  it('shows Resume instead of Pause while paused', () => {
    const { names, handlers } = setup('focus', { isPaused: true })
    expect(names[0]).toBe('Resume')
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(handlers.onResume).toHaveBeenCalledOnce()
    expect(handlers.onPause).not.toHaveBeenCalled()
  })

  it('during a break there is no separate Stop: skipping the break ends it', () => {
    const { names } = setup('break')
    expect(names).toEqual(['Pause', 'Reset', 'Skip break'])
  })
})
