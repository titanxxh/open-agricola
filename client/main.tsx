import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/card-sprite.css'
import App from './App.tsx'
import { installStaleChunkRecovery } from './app/stale-chunk-recovery'
import { applyMonthlyBackground } from './utils/seasonalBackground'

installStaleChunkRecovery()
applyMonthlyBackground()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
