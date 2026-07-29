import { lazy, Suspense, useEffect, useState } from 'react'
import { AuthProvider } from './contexts/AuthContext'
import { LocaleProvider, useLocale } from './contexts/LocaleContext'
import { loadCardsManifest } from './services/card-meta'
import { BrandMark } from './components/common/BrandMark'
import { GameLoadScreen } from './components/common/GameLoadScreen'
import { AppErrorBoundary } from './app/AppErrorBoundary'
import { AppShellLoadScreen } from './app/AppShellLoadScreen'
import { getGameLoadProgress } from './app/game-load-progress'
import { GameContextRouter } from './app/GameContextRouter'
import './styles/bootstrap-shell.css'

const PageRouterLazy = lazy(() =>
  import('./app/PageRouter').then((m) => ({ default: m.PageRouter })),
)

function AppLoadFailure({ detail }: { detail?: string }) {
  const { t } = useLocale()
  const embedded = new URLSearchParams(window.location.search).get('embedded') === '1'
  return (
    <div className="ws-status-screen">
      <div className="ws-status-card">
        {!embedded ? (
          <BrandMark
            title="Open Agricola"
            titleAs="h2"
            className="brand-mark-centered ws-status-brand"
            titleClassName="ws-status-title"
            homeLinkLabel={t('platform.backToLobbyPlain')}
          />
        ) : null}
        <div className="ws-status-text" role="alert">{t('platform.appLoadFailed')}</div>
        {detail ? <div className="ws-status-text">{detail}</div> : null}
        <div className="ws-error-actions">
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            {t('platform.retry')}
          </button>
        </div>
      </div>
    </div>
  )
}

function AppContent() {
  const { t } = useLocale()
  const [manifestReady, setManifestReady] = useState(false)
  const [manifestError, setManifestError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadCardsManifest()
      .then(() => {
        if (!cancelled) setManifestReady(true)
      })
      .catch((err: Error) => {
        if (!cancelled) setManifestError(err.message ?? String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (manifestError) {
    return <AppLoadFailure detail={`Failed to load card metadata: ${manifestError}`} />
  }

  if (!manifestReady) {
    const { percent, labelKey } = getGameLoadProgress('manifest')
    return <GameLoadScreen percent={percent} label={t(labelKey)} />
  }

  return (
    <AppErrorBoundary fallback={<AppLoadFailure />}>
      <AuthProvider>
        <Suspense fallback={<AppShellLoadScreen />}>
          <PageRouterLazy />
        </Suspense>
      </AuthProvider>
    </AppErrorBoundary>
  )
}

function App() {
  return (
    <LocaleProvider>
      <GameContextRouter>
        <AppContent />
      </GameContextRouter>
    </LocaleProvider>
  )
}

export default App
