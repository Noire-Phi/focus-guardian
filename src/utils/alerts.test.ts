// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLASH_CLASS, FLASH_MS, alertCue, flashScreen } from './alerts'
import { playChime } from './sound'

vi.mock('./sound', () => ({ playChime: vi.fn() }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(playChime).mockClear()
})

afterEach(() => {
  vi.runAllTimers()
  vi.useRealTimers()
})

describe('flashScreen', () => {
  it('lights up the edges once, then clears', () => {
    const root = document.documentElement
    flashScreen()
    expect(root.classList.contains(FLASH_CLASS)).toBe(true)
    vi.advanceTimersByTime(FLASH_MS)
    expect(root.classList.contains(FLASH_CLASS)).toBe(false)
  })

  it('restarts the timing when alerts come close together', () => {
    const root = document.documentElement
    flashScreen()
    vi.advanceTimersByTime(FLASH_MS - 100)
    flashScreen()
    vi.advanceTimersByTime(200)
    expect(root.classList.contains(FLASH_CLASS)).toBe(true)
  })
})

describe('alertCue', () => {
  it('plays the chime and flashes, each only when on', () => {
    const root = document.documentElement
    alertCue({ sound: true, flash: false })
    expect(playChime).toHaveBeenCalledTimes(1)
    expect(root.classList.contains(FLASH_CLASS)).toBe(false)

    alertCue({ sound: false, flash: true })
    expect(playChime).toHaveBeenCalledTimes(1)
    expect(root.classList.contains(FLASH_CLASS)).toBe(true)
  })
})
