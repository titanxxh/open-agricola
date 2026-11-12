import { StrictMode, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { AppErrorBoundary } from '../app/AppErrorBoundary'
import { GameContainerApi } from '../app/GameContainerApi'
import { getGameLoadProgress } from '../app/game-load-progress'
import { installStaleChunkRecovery } from '../app/stale-chunk-recovery'
import { GameLoadScreen } from '../components/common/GameLoadScreen'
import { AuthProvider, useAuth } from '../contexts/AuthContext'
import { LocaleProvider, useLocale } from '../contexts/LocaleContext'
import { getBrowserReloadRequired, subscribeBrowserReload } from '../services/browser-api'
import { loadCardsManifest } from '../services/card-meta'
import { loadLanguageManifest, loadLanguagePack } from '../services/language-pack'
import '../index.css'
import '../App.css'
import '../styles/card-sprite.css'

function StandaloneLink() {
  return <a href={import.meta.env.BASE_URL} target="_blank" rel="noopener noreferrer">Open Agricola</a>
}

function WorkshopGame() {
  const { loading, user } = useAuth()
  const { t } = useLocale()
  const reloadRequired = useSyncExternalStore(subscribeBrowserReload, getBrowserReloadRequired)
  if (reloadRequired) return <StandaloneLink />
  if (loading) {
    const { percent, labelKey } = getGameLoadProgress('auth')
    return <GameLoadScreen percent={percent} label={t(labelKey)} />
  }
  return user ? <GameContainerApi /> : <StandaloneLink />
}

export async function initializeWorkshopGame(root: HTMLElement): Promise<void> {
  installStaleChunkRecovery()
  const manifest = await loadLanguageManifest()
  let saved: string | null = null
  try { saved = localStorage.getItem('open-agricola-locale-v2') } catch { /* storage may be disabled */ }
  const locale = manifest.languages.find(language => language.id === saved)?.id ?? manifest.defaultLocale
  await Promise.all([loadLanguagePack(locale), loadCardsManifest()])
  createRoot(root).render(
    <StrictMode>
      <AppErrorBoundary fallback={<StandaloneLink />}>
        <LocaleProvider><AuthProvider><WorkshopGame /></AuthProvider></LocaleProvider>
      </AppErrorBoundary>
    </StrictMode>,
  )
}
