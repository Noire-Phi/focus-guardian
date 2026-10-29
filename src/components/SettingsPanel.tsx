import { useState } from 'react'
import type { Detections, Sensitivity, Settings, Theme } from '../types'
import { SENSITIVITY_HINTS } from '../utils/sensitivity'
import { DEFAULT_SETTINGS, isValidMinutes, MINUTE_LIMITS } from '../utils/storage'

type MinutesField = keyof typeof MINUTE_LIMITS

interface Props {
  settings: Settings
  onChange: (settings: Settings) => void
}

const DETECTIONS: { key: keyof Detections; label: string; hint: string }[] = [
  { key: 'lookingAway', label: 'Looking away', hint: 'Camera: away from your screen or book' },
  { key: 'phone', label: 'Phone', hint: 'Camera: a phone in view' },
  { key: 'posture', label: 'Posture', hint: 'Camera: slouching or leaning (calibrate first)' },
  { key: 'tabLeaves', label: 'Leaving the tab', hint: 'Switching to another tab or app' },
]

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const SENSITIVITIES: { value: Sensitivity; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

export function SettingsPanel({ settings, onChange }: Props) {
  // Bumped on reset so the minute boxes, which keep their own text, start over
  const [resetCount, setResetCount] = useState(0)
  const setDetection = (key: keyof Detections, on: boolean) =>
    onChange({ ...settings, detections: { ...settings.detections, [key]: on } })

  return (
    <details className="settings card">
      <summary className="section-title">Settings</summary>
      <div className="settings__body" key={resetCount}>
        <fieldset className="settings__group">
          <legend>Timer</legend>
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
          <p className="settings__note">Changes apply from the next focus session or break.</p>
        </fieldset>

        <fieldset className="settings__group">
          <legend>Appearance</legend>
          <div className="settings__segmented" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <label key={t.value}>
                <input
                  type="radio"
                  name="theme"
                  value={t.value}
                  checked={settings.theme === t.value}
                  onChange={() => onChange({ ...settings, theme: t.value })}
                />
                <span>{t.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="settings__group">
          <legend>Alerts</legend>
          <label className="settings__row">
            <span>
              Alert sound
              <small className="settings__hint">When a phase ends, and with each alert</small>
            </span>
            <input
              type="checkbox"
              checked={settings.sound}
              onChange={(e) => onChange({ ...settings, sound: e.target.checked })}
            />
          </label>
        </fieldset>

        <fieldset className="settings__group">
          <legend>Detections</legend>
          {DETECTIONS.map((d) => (
            <label key={d.key} className="settings__row">
              <span>
                {d.label}
                <small className="settings__hint">{d.hint}</small>
              </span>
              <input
                type="checkbox"
                checked={settings.detections[d.key]}
                onChange={(e) => setDetection(d.key, e.target.checked)}
              />
            </label>
          ))}
          <p className="settings__note">
            Camera checks run during a focus session while the camera is on. The focus score needs
            the looking-away check.
          </p>
        </fieldset>

        <fieldset className="settings__group">
          <legend>Sensitivity</legend>
          <div className="settings__segmented" role="radiogroup" aria-label="Sensitivity">
            {SENSITIVITIES.map((s) => (
              <label key={s.value}>
                <input
                  type="radio"
                  name="sensitivity"
                  value={s.value}
                  checked={settings.sensitivity === s.value}
                  onChange={() => onChange({ ...settings, sensitivity: s.value })}
                />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
          <p className="settings__note">{SENSITIVITY_HINTS[settings.sensitivity]}</p>
        </fieldset>

        <button
          type="button"
          className="link-button settings__reset"
          onClick={() => {
            onChange(DEFAULT_SETTINGS)
            setResetCount((n) => n + 1)
          }}
        >
          Reset to defaults
        </button>
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
