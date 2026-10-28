import { useEffect, useRef, useState } from 'react'
import type { Distraction } from '../types'
import { formatDuration, formatTimeOfDay } from '../utils/time'

// Pressing this key anywhere (outside a text field) jumps to the note box
const SHORTCUT_KEY = 'd'

interface Props {
  distractions: Distraction[]
  tabLeaves: number
  awayMs: number
  onAdd: (note: string) => void
}

export function DistractionLog({ distractions, tabLeaves, awayMs, onAdd }: Props) {
  const [note, setNote] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const typing =
        target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      if (typing || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== SHORTCUT_KEY)
        return
      e.preventDefault()
      inputRef.current?.focus()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  function submit() {
    // An empty note is fine: logging fast matters more than describing it
    onAdd(note.trim())
    setNote('')
  }

  return (
    <section className="distractions" aria-label="Distractions">
      <form
        className="distractions__form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          ref={inputRef}
          className="distractions__input"
          type="text"
          value={note}
          maxLength={120}
          placeholder="Got distracted? Note it (press D)"
          aria-label="Distraction note"
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="submit" className="button">
          Log
        </button>
      </form>

      <p className="distractions__summary">
        {tabLeaves === 0
          ? 'You haven’t left this tab.'
          : `Left this tab ${tabLeaves} ${tabLeaves === 1 ? 'time' : 'times'} (${formatDuration(awayMs)} away).`}
      </p>

      {distractions.length > 0 && (
        <ul className="distractions__list">
          {distractions.map((d, i) => (
            <li key={`${d.at}-${i}`}>
              <time className="distractions__time">{formatTimeOfDay(d.at)}</time>
              <span className={d.note ? undefined : 'distractions__empty'}>
                {d.note || 'No note'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
