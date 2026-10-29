import { Suspense, lazy, useState } from 'react'
import './App.css'
import { DistractionLog } from './components/DistractionLog'
import { IntentionInput } from './components/IntentionInput'
import { SettingsPanel } from './components/SettingsPanel'
import { TimerControls } from './components/TimerControls'
import { TimerDisplay } from './components/TimerDisplay'
import { TodaySummary } from './components/TodaySummary'
import { Webcam } from './components/Webcam'
import { useFocusTimer } from './hooks/useFocusTimer'
import { useLocalStorage } from './hooks/useLocalStorage'
import type { Session } from './types'
import { summarizeDay } from './utils/stats'
import { loadSessions, loadSettings, saveSessions, saveSettings } from './utils/storage'

// Loaded only when first opened, so Chart.js isn't part of the app's first load
const Dashboard = lazy(() =>
  import('./components/Dashboard').then((m) => ({ default: m.Dashboard })),
)

type View = 'timer' | 'dashboard'

function App() {
  const [settings, setSettings] = useLocalStorage(loadSettings, saveSettings)
  const [sessions, setSessions] = useLocalStorage(loadSessions, saveSessions)
  // Kept after a session ends, since the next session is often the same task
  const [intention, setIntention] = useState('')
  const [view, setView] = useState<View>('timer')

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
      <nav className="view-switch" aria-label="Views">
        <button type="button" aria-pressed={view === 'timer'} onClick={() => setView('timer')}>
          Timer
        </button>
        <button
          type="button"
          aria-pressed={view === 'dashboard'}
          onClick={() => setView('dashboard')}
        >
          Dashboard
        </button>
      </nav>

      {view === 'dashboard' && (
        <Suspense fallback={<p className="chart-card__empty">Loading dashboard…</p>}>
          <Dashboard sessions={sessions} now={timer.now} onGoToTimer={() => setView('timer')} />
        </Suspense>
      )}

      {/* Hidden rather than removed, so the timer and camera keep running on the dashboard */}
      <div className="app__view" hidden={view !== 'timer'}>
        <TimerDisplay
          phase={timer.phase}
          remainingMs={timer.remainingMs}
          isPaused={timer.isPaused}
        />
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
          onReset={timer.reset}
          onSkip={timer.skip}
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
        <Webcam
          watchAttention={timer.phase === 'focus' && !timer.isPaused}
          sound={settings.sound}
          onCameraStats={timer.recordCamera}
        />
      </div>
    </main>
  )
}

export default App
