import { useId, useRef, useState } from 'react'
import { useRestoreFocus } from '../hooks/useRestoreFocus'
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
  // Reset rebuilds the form, Reset button included: keep focus on it
  const panelRef = useRef<HTMLDetailsElement>(null)
  useRestoreFocus(panelRef, '.settings__reset')
  const setDetection = (key: keyof Detections, on: boolean) =>
    onChange({ ...settings, detections: { ...settings.detections, [key]: on } })

  return (
    <details className="settings card" ref={panelRef}>
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
          <legend>Theme</legend>
          <div className="settings__segmented">
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
          <ToggleRow
            label="Alert sound"
            hint="When a phase ends, and with each alert"
            checked={settings.sound}
            onChange={(sound) => onChange({ ...settings, sound })}
          />
          <ToggleRow
            label="Flash the screen"
            hint="The window’s edges light up with each alert, so you see it without the sound"
            checked={settings.flash}
            onChange={(flash) => onChange({ ...settings, flash })}
          />
          <p className="settings__note">Alerts also show as a message at the top of the window.</p>
        </fieldset>

        <fieldset className="settings__group">
          <legend>Keyboard</legend>
          <ToggleRow
            label="D to note a distraction"
            hint="Press D anywhere to jump to the note box. Turn off if it gets in the way."
            checked={settings.shortcut}
            onChange={(shortcut) => onChange({ ...settings, shortcut })}
          />
        </fieldset>

        <fieldset className="settings__group">
          <legend>Detections</legend>
          {DETECTIONS.map((d) => (
            <ToggleRow
              key={d.key}
              label={d.label}
              hint={d.hint}
              checked={settings.detections[d.key]}
              onChange={(on) => setDetection(d.key, on)}
            />
          ))}
          <p className="settings__note">
            Camera checks run during a focus session while the camera is on. The focus score needs
            the looking-away check.
          </p>
        </fieldset>

        <fieldset className="settings__group">
          <legend>Sensitivity</legend>
          <div className="settings__segmented">
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

interface ToggleRowProps {
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}

// The whole row toggles the checkbox. Screen readers get the label as its name and the hint
// as its description, rather than both run together as one long name.
function ToggleRow({ label, hint, checked, onChange }: ToggleRowProps) {
  const id = useId()
  return (
    <label className="settings__row">
      <span>
        <span id={`${id}-label`}>{label}</span>
        <small id={`${id}-hint`} className="settings__hint">
          {hint}
        </small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
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
  const errorId = useId()

  return (
    <div className="settings__field">
      <label className="settings__row">
        <span>
          {label}
          <span className="visually-hidden"> in minutes</span>
        </span>
        <span className="settings__minutes">
          <input
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={1}
            value={text}
            aria-invalid={!valid}
            aria-describedby={valid ? undefined : errorId}
            onChange={(e) => {
              setText(e.target.value)
              const next = Number(e.target.value)
              if (isValidMinutes(field, next)) onChange(next)
            }}
            // Leaving the box with an invalid number puts back the last saved value
            onBlur={() => setText(String(value))}
          />
          <span aria-hidden="true">min</span>
        </span>
      </label>
      {!valid && (
        <p id={errorId} className="settings__error">
          Enter a whole number from {min} to {max}. Leaving the box keeps {value}.
        </p>
      )}
    </div>
  )
}
