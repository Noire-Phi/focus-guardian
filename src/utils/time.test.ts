import { describe, expect, it } from 'vitest'
import {
  addDays,
  startOfWeek,
  formatClock,
  formatDuration,
  formatTimeOfDay,
  isSameDay,
  minutesToMs,
  remainingMs,
  startOfDay,
} from './time'

const MIN = 60_000

describe('formatClock', () => {
  it('shows minutes and seconds', () => {
    expect(formatClock(25 * MIN)).toBe('25:00')
    expect(formatClock(249_000)).toBe('4:09')
  })

  it('rounds up, so 0:00 only shows when time is really up', () => {
    expect(formatClock(400)).toBe('0:01')
    expect(formatClock(0)).toBe('0:00')
  })

  it('treats negative time as zero', () => {
    expect(formatClock(-5000)).toBe('0:00')
  })

  it('adds hours when needed', () => {
    expect(formatClock(65 * MIN)).toBe('1:05:00')
  })
})

describe('formatDuration', () => {
  it('shows seconds under a minute', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(21_584)).toBe('21s')
    expect(formatDuration(59_999)).toBe('59s')
  })

  it('rounds down to whole minutes from a minute up', () => {
    expect(formatDuration(MIN)).toBe('1m')
    expect(formatDuration(45 * MIN + 59_000)).toBe('45m')
  })

  it('shows hours, dropping zero minutes', () => {
    expect(formatDuration(90 * MIN)).toBe('1h 30m')
    expect(formatDuration(120 * MIN)).toBe('2h')
  })
})

describe('remainingMs', () => {
  it('is the time until the end, never negative', () => {
    expect(remainingMs(5000, 1000)).toBe(4000)
    expect(remainingMs(1000, 5000)).toBe(0)
  })
})

describe('days', () => {
  const noon = new Date(2026, 9, 28, 12).getTime()

  it('startOfDay is local midnight', () => {
    expect(startOfDay(noon)).toBe(new Date(2026, 9, 28).getTime())
  })

  it('startOfWeek is local midnight on Monday', () => {
    const monday = new Date(2026, 9, 26).getTime()
    expect(startOfWeek(noon)).toBe(monday) // Wednesday
    expect(startOfWeek(monday)).toBe(monday)
    expect(startOfWeek(new Date(2026, 10, 1, 23).getTime())).toBe(monday) // Sunday
  })

  it('addDays moves by calendar days', () => {
    expect(addDays(new Date(2026, 9, 29).getTime(), 3)).toBe(new Date(2026, 10, 1).getTime())
    expect(addDays(new Date(2026, 9, 29).getTime(), -7)).toBe(new Date(2026, 9, 22).getTime())
  })

  it('isSameDay splits at local midnight', () => {
    expect(isSameDay(noon, new Date(2026, 9, 28, 23, 59).getTime())).toBe(true)
    expect(isSameDay(noon, new Date(2026, 9, 29, 0, 1).getTime())).toBe(false)
  })
})

it('minutesToMs converts minutes', () => {
  expect(minutesToMs(25)).toBe(25 * MIN)
})

it('formatTimeOfDay shows a clock time', () => {
  expect(formatTimeOfDay(new Date(2026, 9, 28, 14, 5).getTime())).toMatch(/\d{1,2}:05/)
})
