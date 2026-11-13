import { isPrereleaseClient, prereleaseStartUrl } from '../services/prerelease-runtime'
import { lazy, Suspense, useEffect, useState, type ReactElement } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { LoginPage } from './LoginPage'
import { LobbyPage } from './LobbyPage'
import { OnboardingPage } from './OnboardingPage'
import { ResetPasswordPage } from './ResetPasswordPage'
import { SettingsPage } from './SettingsPage'
import { PrereleaseHandoffPage } from './PrereleaseHandoffPage'
import { MobileTabBar } from '../components/common/MobileTabBar'
import { GameLoadScreen } from '../components/common/GameLoadScreen'
import { AppShellLoadScreen } from './AppShellLoadScreen'
import { getGameLoadProgress } from './game-load-progress'
import { isHotseatSetupQuery } from './game-setup-query'
import { SandboxAppLazy } from '../sandbox'
import { setPage, type PlatformPage } from '../utils/platform-page-url'
import '../App.css'

const OperationsPageLazy = lazy(() => import('./OperationsPage').then(m => ({ default: m.OperationsPage })))

const EncyclopediaPageLazy = lazy(() =>
  import('./encyclopedia/EncyclopediaPage').then((m) => ({ default: m.EncyclopediaPage })),
)

const GameContainerApiLazy = lazy(() =>
  import('./GameContainerApi').then((m) => ({ default: m.GameContainerApi })),
)

function getPage(): PlatformPage {
  const params = new URLSearchParams(window.location.search)
  const page = params.get('page')
  if (page === 'prerelease-handoff') return page
  if (page === 'game' || page === 'workshop' || page === 'lobby' || page === 'settings' || page === 'login' || page === 'onboarding' || page === 'reset-password' || page === 'operations' || page === 'encyclopedia') return page
  if (params.get('context')) return 'game'
  if (params.get('room') || params.get('transport') === 'ws') return 'game'
  if (isHotseatSetupQuery(window.location.search)) return 'game'
  return 'lobby'
}

export function PageRouter() {
  const { user, loading } = useAuth()
  const { t } = useLocale()
  const [, setTick] = useState(0)

  useEffect(() => {
    const handler = () => setTick(t => t + 1)
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  const page = getPage()

  useEffect(() => {
    if (loading || !user) return
    if (page === 'login') {
      const params = new URLSearchParams(window.location.search)
      if (params.has('room') || params.has('context')) {
        params.delete('page')
        const search = params.toString()
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
        )
        window.dispatchEvent(new PopStateEvent('popstate'))
        return
      }
      const authError = params.get('authError')
      if (authError) {
        setPage('settings', { authError })
        return
      }
    }
    if (page === 'onboarding' || page === 'login') {
      setPage('lobby')
    }
  }, [loading, page, user])

  if (page === 'encyclopedia') {
    return (
      <>
        <Suspense fallback={<AppShellLoadScreen />}>
          <EncyclopediaPageLazy />
        </Suspense>
        <MobileTabBar current="encyclopedia" onNavigate={(t) => setPage(t)} />
      </>
    )
  }

  if (loading) {
    const { percent, labelKey } = getGameLoadProgress('auth')
    return <GameLoadScreen percent={percent} label={t(labelKey)} />
  }

  // A reset link may be opened while another account is signed in; completing it switches accounts.
  if (isPrereleaseClient() && ['login', 'onboarding', 'reset-password', 'settings', 'operations', 'prerelease-handoff', 'workshop'].includes(page)) {
    return <main className="prerelease-access-screen"><p>{t(page === 'workshop' ? 'prerelease.readonlyError' : 'prerelease.returnToProduction')}</p></main>
  }
  if (page === 'reset-password') return <ResetPasswordPage />
  if (page === 'prerelease-handoff') return <PrereleaseHandoffPage />

  if (!user) {
    if (isPrereleaseClient()) return <main className="prerelease-access-screen">
      <p>{t('prerelease.returnToProduction')}</p>
      <a className="btn-primary" href={prereleaseStartUrl()}>{t('prerelease.entry')}</a>
    </main>
    if (page === 'onboarding') return <OnboardingPage />
    return <LoginPage />
  }

  let pageNode: ReactElement
  switch (page) {
    case 'game':
      pageNode = (
        <Suspense fallback={<AppShellLoadScreen />}>
          <GameContainerApiLazy />
        </Suspense>
      )
      break
    case 'workshop':
      pageNode = (
        <Suspense fallback={<AppShellLoadScreen />}>
          <SandboxAppLazy />
        </Suspense>
      )
      break
    case 'operations':
      pageNode = <Suspense fallback={<AppShellLoadScreen />}><OperationsPageLazy /></Suspense>
      break
    case 'settings':
      pageNode = <SettingsPage />
      break
    case 'onboarding':
    case 'lobby':
    default:
      pageNode = <LobbyPage />
      break
  }

  const showTabBar = page === 'lobby' || page === 'workshop' || page === 'settings'

  return (
    <>
      {pageNode}
      {showTabBar && (
        <MobileTabBar
          current={page as 'lobby' | 'workshop' | 'settings'}
          onNavigate={(t) => setPage(t)}
        />
      )}
    </>
  )
}
