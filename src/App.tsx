import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import './App.css'
import { DistractionLog } from './components/DistractionLog'
import { IntentionInput } from './components/IntentionInput'
import { PhaseNotice } from './components/PhaseNotice'
import { SettingsPanel } from './components/SettingsPanel'
import { TimerControls } from './components/TimerControls'
import { TimerDisplay } from './components/TimerDisplay'
import { TodaySummary } from './components/TodaySummary'
import { Webcam } from './components/Webcam'
import { useFocusTimer } from './hooks/useFocusTimer'
import { useLocalStorage } from './hooks/useLocalStorage'
import { focusFirst, useRestoreFocus } from './hooks/useRestoreFocus'
import type { Session } from './types'
import { phaseEndedMessage } from './utils/phaseEnd'
import { summarizeDay } from './utils/stats'
import { loadSessions, loadSettings, saveSessions, saveSettings } from './utils/storage'
import { applyTheme } from './utils/theme'
import { pageTitle } from './utils/title'

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
  // Alerts from the timer and the camera share one stack at the bottom of the window
  const [alertStack, setAlertStack] = useState<HTMLDivElement | null>(null)
  const sessionRef = useRef<HTMLElement>(null)
  // Where to put focus in the session card: its main button, or the intention box if there's
  // nothing to start yet
  const sessionTarget = ['.controls button:not(:disabled)', '.intention__input']

  useEffect(() => {
    applyTheme(settings.theme)
  }, [settings.theme])

  function addSession(session: Session) {
    setSessions((prev) => (prev.some((s) => s.id === session.id) ? prev : [...prev, session]))
  }

  const timer = useFocusTimer(settings, addSession)
  const canStart = intention.trim() !== ''
  // Pressing Enter in the intention box removes it, Stop removes itself: keep focus here
  useRestoreFocus(sessionRef, sessionTarget)

  // The time left in the tab title, so it can be seen from other tabs and windows
  useEffect(() => {
    document.title = pageTitle(timer.phase, timer.remainingMs, timer.isPaused, timer.phaseEnded)
  }, [timer.phase, timer.remainingMs, timer.isPaused, timer.phaseEnded])

  const notice = timer.phaseEnded && phaseEndedMessage(timer.phaseEnded, settings.breakMinutes)

  // Dismiss removes its own button: carry on from the timer's main button
  function dismissNotice() {
    timer.dismissPhaseEnded()
    focusFirst(sessionRef.current, sessionTarget)
  }

  // From the dashboard's empty state: show the timer and put focus where you'd start
  function goToTimer() {
    flushSync(() => setView('timer'))
    focusFirst(sessionRef.current, ['.intention__input', ...sessionTarget])
  }

  function startFocus() {
    if (canStart && timer.phase === 'idle') timer.start(intention.trim())
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Focus Guardian</h1>
        <nav className="segmented view-switch" aria-label="Views">
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
      </header>

      {/* Fixed at the bottom of the window, so alerts are seen wherever the page is scrolled */}
      <div className="alert-stack" ref={setAlertStack}>
        {timer.phaseEnded && (
          <PhaseNotice
            ended={timer.phaseEnded}
            breakMinutes={settings.breakMinutes}
            onDismiss={dismissNotice}
          />
        )}
      </div>
      {/* Read out by screen readers; always on the page, so changes are announced */}
      <p className="visually-hidden" role="status">
        {notice ? `${notice.title}. ${notice.text}` : ''}
      </p>

      <main className="app__main">
        {view === 'dashboard' && (
          <Suspense fallback={<p className="empty-note">Loading dashboard…</p>}>
            <Dashboard sessions={sessions} now={timer.now} onGoToTimer={goToTimer} />
          </Suspense>
        )}

        {/* Hidden rather than removed, so the timer and camera keep running on the dashboard.
            Two columns on wide screens: the session on the left, everything else beside it. */}
        <div className="timer-view" hidden={view !== 'timer'}>
          <section
            ref={sessionRef}
            className="timer-view__session card"
            aria-label="Focus session"
            tabIndex={-1}
          >
            <TimerDisplay
              phase={timer.phase}
              remainingMs={timer.remainingMs}
              isPaused={timer.isPaused}
            />
            {timer.session ? (
              <p className="current-intention">
                Working on <strong>{timer.session.intention}</strong>
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
                shortcut={settings.shortcut}
                onAdd={timer.addDistraction}
              />
            )}
          </section>

          <div className="timer-view__side">
            <TodaySummary summary={summarizeDay(sessions, timer.now)} />
            <Webcam
              watchAttention={timer.phase === 'focus' && !timer.isPaused}
              settings={settings}
              alertRoot={alertStack}
              onCameraStats={timer.recordCamera}
            />
            <SettingsPanel settings={settings} onChange={setSettings} />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
