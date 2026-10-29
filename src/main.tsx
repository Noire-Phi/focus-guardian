import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadSettings } from './utils/storage'
import { applyTheme } from './utils/theme'

// Before the first render, so a forced light or dark theme doesn't flash the other one
applyTheme(loadSettings().theme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
