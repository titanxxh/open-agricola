import { lazy, Suspense, useEffect, useState } from 'react'
import { AuthProvider } from './contexts/AuthContext'
import { LocaleProvider, useLocale } from './contexts/LocaleContext'
import { loadCardsManifest } from './services/card-meta'
import { GameLoadScreen } from './components/common/GameLoadScreen'
import { getGameLoadProgress } from './app/game-load-progress'
import { GameContextRouter } from './app/GameContextRouter'
import './styles/bootstrap-shell.css'

const PageRouterLazy = lazy(() =>
  import('./app/PageRouter').then((m) => ({ default: m.PageRouter })),
)

function RouterShellFallback() {
  const { t } = useLocale()
  const { percent, labelKey } = getGameLoadProgress('appShell')
  return <GameLoadScreen percent={percent} label={t(labelKey)} />
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
    return (
      <div className="app-bootstrap-error">
        Failed to load card metadata: {manifestError}
      </div>
    )
  }

  if (!manifestReady) {
    const { percent, labelKey } = getGameLoadProgress('manifest')
    return <GameLoadScreen percent={percent} label={t(labelKey)} />
  }

  return (
    <AuthProvider>
      <Suspense fallback={<RouterShellFallback />}>
        <PageRouterLazy />
      </Suspense>
    </AuthProvider>
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
