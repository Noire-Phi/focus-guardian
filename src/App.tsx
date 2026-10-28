import { useState } from 'react'
import './App.css'
import { TimerControls } from './components/TimerControls'
import { TimerDisplay } from './components/TimerDisplay'
import { useFocusTimer } from './hooks/useFocusTimer'
import { loadSettings } from './utils/storage'

function App() {
  // Read once for now; SettingsPanel (plan step 5) will make these editable
  const [settings] = useState(loadSettings)
  const timer = useFocusTimer(settings)

  return (
    <main className="app">
      <h1 className="app__title">Focus Guardian</h1>
      <TimerDisplay phase={timer.phase} remainingMs={timer.remainingMs} isPaused={timer.isPaused} />
      <TimerControls
        phase={timer.phase}
        isPaused={timer.isPaused}
        onStart={timer.start}
        onPause={timer.pause}
        onResume={timer.resume}
        onStop={timer.stop}
      />
    </main>
  )
}

export default App
