import type { StudyMode } from '../utils/attention'

const MODES: { value: StudyMode; label: string; hint: string }[] = [
  { value: 'screen', label: 'Screen', hint: 'Focused when looking at the screen' },
  {
    value: 'book',
    label: 'Book / Paper',
    hint: 'Focused when looking down at your book or paper',
  },
  {
    value: 'mixed',
    label: 'Mixed',
    hint: 'Focused on the screen, the book, or moving between them',
  },
]

interface Props {
  value: StudyMode
  onChange: (mode: StudyMode) => void
}

export function StudyModePicker({ value, onChange }: Props) {
  const current = MODES.find((m) => m.value === value)
  return (
    <fieldset className="study-mode">
      <legend className="study-mode__legend">Study mode</legend>
      <div className="study-mode__options">
        {MODES.map((m) => (
          <label key={m.value} className="study-mode__option">
            <input
              type="radio"
              name="study-mode"
              value={m.value}
              checked={value === m.value}
              onChange={() => onChange(m.value)}
            />
            <span>{m.label}</span>
          </label>
        ))}
      </div>
      <p className="study-mode__hint">{current?.hint}</p>
    </fieldset>
  )
}
