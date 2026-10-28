import { useState } from 'react'
import type { Settings } from '../types'
import { isValidMinutes, MINUTE_LIMITS } from '../utils/storage'

type MinutesField = keyof typeof MINUTE_LIMITS

interface Props {
  settings: Settings
  onChange: (settings: Settings) => void
}

export function SettingsPanel({ settings, onChange }: Props) {
  return (
    <details className="settings">
      <summary className="section-title">Settings</summary>
      <div className="settings__body">
        <MinutesInput
          label="Focus length"
          field="focusMinutes"
          value={settings.focusMinutes}
          onChange={(focusMinutes) => onChange({ ...settings, focusMinutes })}
        />
        <MinutesInput
          label="Break length"
          field="breakMinutes"
          value={settings.breakMinutes}
          onChange={(breakMinutes) => onChange({ ...settings, breakMinutes })}
        />
        <label className="settings__row">
          <span>Sound when a phase ends</span>
          <input
            type="checkbox"
            checked={settings.sound}
            onChange={(e) => onChange({ ...settings, sound: e.target.checked })}
          />
        </label>
        <p className="settings__note">Changes apply from the next focus session or break.</p>
      </div>
    </details>
  )
}

interface MinutesInputProps {
  label: string
  field: MinutesField
  value: number
  onChange: (value: number) => void
}

// Keeps its own text so you can clear the box while typing; only valid numbers are saved
function MinutesInput({ label, field, value, onChange }: MinutesInputProps) {
  const [text, setText] = useState(String(value))
  const { min, max } = MINUTE_LIMITS[field]
  const valid = isValidMinutes(field, Number(text))

  return (
    <label className="settings__row">
      <span>{label}</span>
      <span className="settings__minutes">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={text}
          aria-invalid={!valid}
          onChange={(e) => {
            setText(e.target.value)
            const next = Number(e.target.value)
            if (isValidMinutes(field, next)) onChange(next)
          }}
          // Leaving the box with an invalid number puts back the last saved value
          onBlur={() => setText(String(value))}
        />
        min
      </span>
    </label>
  )
}
