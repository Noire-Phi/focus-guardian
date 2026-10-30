// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '../types'
import { DEFAULT_SETTINGS } from '../utils/storage'
import { SettingsPanel } from './SettingsPanel'

afterEach(cleanup)

function setup(settings: Settings = DEFAULT_SETTINGS) {
  const onChange = vi.fn<(s: Settings) => void>()
  render(<SettingsPanel settings={settings} onChange={onChange} />)
  return onChange
}

describe('SettingsPanel', () => {
  it('turns a detection off, leaving the others alone', () => {
    const onChange = setup()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Phone' }))
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      detections: { ...DEFAULT_SETTINGS.detections, phone: false },
    })
  })

  it('turns the alert sound off', () => {
    const onChange = setup()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alert sound' }))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, sound: false })
  })

  it('names each switch by its label and describes it with its hint', () => {
    setup()
    const flash = screen.getByRole('checkbox', { name: 'Flash the screen' })
    expect(flash.getAttribute('aria-describedby')).toBeTruthy()
    expect(document.getElementById(flash.getAttribute('aria-describedby')!)?.textContent).toMatch(
      /without the sound/,
    )
  })

  it('turns on the screen flash and turns off the D shortcut', () => {
    const onChange = setup()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Flash the screen' }))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, flash: true })
    fireEvent.click(screen.getByRole('checkbox', { name: 'D to note a distraction' }))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, shortcut: false })
  })

  it('changes sensitivity and explains the chosen level', () => {
    const onChange = setup({ ...DEFAULT_SETTINGS, sensitivity: 'high' })
    expect(screen.getByText(/Strict/)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Low' }))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, sensitivity: 'low' })
  })

  it('saves a valid timer length and ignores an invalid one', () => {
    const onChange = setup()
    const focus = screen.getByRole('spinbutton', { name: /Focus length/ })
    fireEvent.change(focus, { target: { value: '999' } })
    expect(onChange).not.toHaveBeenCalled()
    // The reason is shown and tied to the box for screen readers
    const error = document.getElementById(focus.getAttribute('aria-describedby')!)
    expect(error?.textContent).toMatch(/from 1 to/)
    fireEvent.change(focus, { target: { value: '45' } })
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, focusMinutes: 45 })
  })

  it('switches the theme', () => {
    const onChange = setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, theme: 'dark' })
  })

  it('resets everything to the defaults', () => {
    const onChange = setup({
      ...DEFAULT_SETTINGS,
      focusMinutes: 50,
      sound: false,
      sensitivity: 'low',
      detections: { lookingAway: false, phone: false, posture: false, tabLeaves: false },
    })
    const reset = screen.getByRole('button', { name: 'Reset to defaults' })
    reset.focus()
    fireEvent.click(reset)
    expect(onChange).toHaveBeenCalledWith(DEFAULT_SETTINGS)
    // The form is rebuilt; focus stays on the (new) reset button
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reset to defaults' }))
  })
})
