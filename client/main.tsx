import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/card-sprite.css'
import { installStaleChunkRecovery } from './app/stale-chunk-recovery'
import { loadLanguageManifest, loadLanguagePack } from './services/language-pack'

installStaleChunkRecovery()

const root = createRoot(document.getElementById('root')!)
void (async () => {
  const manifest = await loadLanguageManifest()
  let saved: string | null = null
  try { saved = localStorage.getItem('open-agricola-locale-v2') } catch { /* storage may be disabled */ }
  const locale = manifest.languages.find(language => language.id === saved)?.id ?? manifest.defaultLocale
  await loadLanguagePack(locale)
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('page') === 'encyclopedia-prototype') {
    const [{ default: Prototype }, { loadCardsManifest }] = await Promise.all([
      import('../docs/prototypes/encyclopedia/EncyclopediaPrototype'), import('./services/card-meta'),
    ])
    await Promise.all([loadLanguagePack('zh'), loadCardsManifest()])
    root.render(<StrictMode><Prototype /></StrictMode>)
    return
  }
  const { default: App } = await import('./App.tsx')
  root.render(<StrictMode><App /></StrictMode>)
})().catch(() => {
  // No language package is available yet, so this bootstrap failure cannot use translations.
  root.render(<main role="alert">Unable to load application. <button onClick={() => location.reload()}>Retry</button></main>)
})
