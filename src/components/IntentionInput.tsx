interface Props {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
}

export function IntentionInput({ value, onChange, onSubmit }: Props) {
  return (
    <label className="intention">
      <span className="intention__label">What are you working on?</span>
      <input
        className="intention__input"
        type="text"
        value={value}
        maxLength={120}
        placeholder="e.g. Write the project plan"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          // Starting moves focus to the Pause button; without this, the same Enter would press it
          e.preventDefault()
          onSubmit()
        }}
      />
    </label>
  )
}
