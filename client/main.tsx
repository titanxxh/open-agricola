import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/card-sprite.css'
import { forgetEncyclopediaBrowseOnReload } from './app/encyclopedia/encyclopedia-session-reset'
import { installStaleChunkRecovery } from './app/stale-chunk-recovery'
import { loadCardTextPack, loadLanguageManifest, loadLanguagePack } from './services/language-pack'
import { startApplication } from './app/application-bootstrap'
import { platformPageFromSearch } from './app/platform-page'
import { afterFirstRender, prefetchCardScreen, showsCards } from './app/startup-prefetch'

const container = document.getElementById('root')
if (!container) throw new Error('Application root is missing')

async function initialLocale() {
  const manifest = await loadLanguageManifest()
  let saved: string | null = null
  try { saved = localStorage.getItem('open-agricola-locale-v2') } catch { /* storage may be disabled */ }
  return manifest.languages.find(language => language.id === saved)?.id ?? manifest.defaultLocale
}

void startApplication(container, async () => {
  installStaleChunkRecovery()
  if (import.meta.env.VITE_STABLE_PAGES_WORKER === '1' && window.top === window && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {})
  }
  forgetEncyclopediaBrowseOnReload()
  const app = import('./App.tsx')
  const page = platformPageFromSearch(window.location.search)
  const locale = await initialLocale()
  const core = loadLanguagePack(locale)
  const cardText = () => loadCardTextPack(locale)
  if (showsCards(page)) {
    void core.then(() => prefetchCardScreen(page, {
      cardText,
      cardsManifest: () => import('./services/card-meta').then(module => module.loadCardsManifest()),
      screen: {
        game: () => import('./app/GameContainerApi'),
        encyclopedia: () => Promise.all([
          import('./app/encyclopedia/EncyclopediaPage'),
          import('./services/card-encyclopedia').then(module => module.loadCardEncyclopedia()),
        ]),
      },
    }), () => {})
  }
  const [{ default: App }] = await Promise.all([app, core])
  createRoot(container).render(<StrictMode><App /></StrictMode>)
  // Card-free screens leave card text until their first screen is up; any card screen opened later still waits for it.
  if (!showsCards(page)) afterFirstRender(() => { void cardText().catch(() => {}) })
}).catch(() => {
  // No language package is available yet, so this bootstrap failure cannot use translations.
  createRoot(container).render(<main role="alert">Unable to load application. <button onClick={() => location.reload()}>Retry</button></main>)
})
