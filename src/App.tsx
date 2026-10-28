import { useState } from 'react'
import './App.css'
import { IntentionInput } from './components/IntentionInput'
import { TimerControls } from './components/TimerControls'
import { TimerDisplay } from './components/TimerDisplay'
import { useFocusTimer } from './hooks/useFocusTimer'
import { useLocalStorage } from './hooks/useLocalStorage'
import type { Session } from './types'
import { loadSessions, loadSettings, saveSessions } from './utils/storage'

function App() {
  // Read once for now; SettingsPanel (plan step 5) will make these editable
  const [settings] = useState(loadSettings)
  const [, setSessions] = useLocalStorage(loadSessions, saveSessions)
  // Kept after a session ends, since the next session is often the same task
  const [intention, setIntention] = useState('')

  function addSession(session: Session) {
    setSessions((prev) => (prev.some((s) => s.id === session.id) ? prev : [...prev, session]))
  }

  const timer = useFocusTimer(settings, addSession)
  const canStart = intention.trim() !== ''

  function startFocus() {
    if (canStart && timer.phase === 'idle') timer.start(intention.trim())
  }

  return (
    <main className="app">
      <h1 className="app__title">Focus Guardian</h1>
      <TimerDisplay phase={timer.phase} remainingMs={timer.remainingMs} isPaused={timer.isPaused} />
      {timer.phase === 'focus' ? (
        <p className="current-intention">
          Working on: <strong>{timer.intention}</strong>
        </p>
      ) : (
        <IntentionInput value={intention} onChange={setIntention} onSubmit={startFocus} />
      )}
      <TimerControls
        phase={timer.phase}
        isPaused={timer.isPaused}
        canStart={canStart}
        onStart={startFocus}
        onPause={timer.pause}
        onResume={timer.resume}
        onStop={timer.stop}
      />
    </main>
  )
}

export default App
