import { useEffect, useRef, useState } from 'react'
import type { Distraction } from '../types'
import { formatDuration, formatTimeOfDay } from '../utils/time'

// Pressing this key anywhere (outside a text field) jumps to the note box. A single-key
// shortcut can be set off by speech input, so it can be turned off in Settings.
const SHORTCUT_KEY = 'd'

interface Props {
  distractions: Distraction[]
  tabLeaves: number
  awayMs: number
  /** The D shortcut is on (Settings) */
  shortcut: boolean
  onAdd: (note: string) => void
}

export function DistractionLog({ distractions, tabLeaves, awayMs, shortcut, onAdd }: Props) {
  const [note, setNote] = useState('')
  // Read out by screen readers after logging, since nothing else announces it
  const [logged, setLogged] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!shortcut) return
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
  }, [shortcut])

  function submit() {
    // An empty note is fine: logging fast matters more than describing it
    onAdd(note.trim())
    setNote('')
    setLogged(`Distraction ${distractions.length + 1} logged.`)
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
          placeholder={shortcut ? 'Got distracted? Note it (press D)' : 'Got distracted? Note it'}
          aria-label="Distraction note"
          aria-keyshortcuts={shortcut ? 'D' : undefined}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="submit" className="button">
          Log
        </button>
      </form>

      <p className="visually-hidden" role="status">
        {logged}
      </p>

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
