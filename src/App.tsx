import { useState } from 'react'
import './App.css'
import { DistractionLog } from './components/DistractionLog'
import { IntentionInput } from './components/IntentionInput'
import { SettingsPanel } from './components/SettingsPanel'
import { TimerControls } from './components/TimerControls'
import { TimerDisplay } from './components/TimerDisplay'
import { TodaySummary } from './components/TodaySummary'
import { useFocusTimer } from './hooks/useFocusTimer'
import { useLocalStorage } from './hooks/useLocalStorage'
import type { Session } from './types'
import { summarizeDay } from './utils/stats'
import { loadSessions, loadSettings, saveSessions, saveSettings } from './utils/storage'

function App() {
  const [settings, setSettings] = useLocalStorage(loadSettings, saveSettings)
  const [sessions, setSessions] = useLocalStorage(loadSessions, saveSessions)
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
      {timer.session ? (
        <p className="current-intention">
          Working on: <strong>{timer.session.intention}</strong>
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
      {timer.session && (
        <DistractionLog
          distractions={timer.session.distractions}
          tabLeaves={timer.session.tabLeaves}
          awayMs={timer.session.awayMs}
          onAdd={timer.addDistraction}
        />
      )}
      <TodaySummary summary={summarizeDay(sessions, timer.now)} />
      <SettingsPanel settings={settings} onChange={setSettings} />
    </main>
  )
}

export default App
