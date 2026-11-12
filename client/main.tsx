import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/card-sprite.css'
import { forgetEncyclopediaBrowseOnReload } from './app/encyclopedia/encyclopedia-session-reset'
import { installStaleChunkRecovery } from './app/stale-chunk-recovery'
import { loadLanguageManifest, loadLanguagePack } from './services/language-pack'
import { startApplication } from './app/application-bootstrap'

const container = document.getElementById('root')
if (!container) throw new Error('Application root is missing')

void startApplication(container, async () => {
  installStaleChunkRecovery()
  forgetEncyclopediaBrowseOnReload()
  const manifest = await loadLanguageManifest()
  let saved: string | null = null
  try { saved = localStorage.getItem('open-agricola-locale-v2') } catch { /* storage may be disabled */ }
  const locale = manifest.languages.find(language => language.id === saved)?.id ?? manifest.defaultLocale
  await loadLanguagePack(locale)
  const { default: App } = await import('./App.tsx')
  createRoot(container).render(<StrictMode><App /></StrictMode>)
}).catch(() => {
  // No language package is available yet, so this bootstrap failure cannot use translations.
  createRoot(container).render(<main role="alert">Unable to load application. <button onClick={() => location.reload()}>Retry</button></main>)
})
