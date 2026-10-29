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
    fireEvent.click(screen.getByRole('checkbox', { name: /Phone/ }))
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      detections: { ...DEFAULT_SETTINGS.detections, phone: false },
    })
  })

  it('turns the alert sound off', () => {
    const onChange = setup()
    fireEvent.click(screen.getByRole('checkbox', { name: /Alert sound/ }))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, sound: false })
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
    fireEvent.change(focus, { target: { value: '45' } })
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, focusMinutes: 45 })
  })

  it('resets everything to the defaults', () => {
    const onChange = setup({
      ...DEFAULT_SETTINGS,
      focusMinutes: 50,
      sound: false,
      sensitivity: 'low',
      detections: { lookingAway: false, phone: false, posture: false, tabLeaves: false },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }))
    expect(onChange).toHaveBeenCalledWith(DEFAULT_SETTINGS)
  })
})
