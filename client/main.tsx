import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/card-sprite.css'
import App from './App.tsx'
import { installStaleChunkRecovery } from './app/stale-chunk-recovery'
import { loadLanguageManifest, loadLanguagePack } from './services/language-pack'

installStaleChunkRecovery()

const root = createRoot(document.getElementById('root')!)
void loadLanguageManifest().then(async manifest => {
  let saved: string | null = null
  try { saved = localStorage.getItem('open-agricola-locale-v2') } catch { /* storage may be disabled */ }
  const locale = manifest.languages.find(language => language.id === saved)?.id ?? manifest.defaultLocale
  await loadLanguagePack(locale)
  root.render(<StrictMode><App /></StrictMode>)
}).catch(() => {
  // No language package is available yet, so this bootstrap failure cannot use translations.
  root.render(<main role="alert">Unable to load language. <button onClick={() => location.reload()}>Retry</button></main>)
})
