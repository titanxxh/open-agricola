import { lazy, Suspense, useEffect, useState, type ReactElement } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { LoginPage } from './LoginPage'
import { LobbyPage } from './LobbyPage'
import { OnboardingPage } from './OnboardingPage'
import { SettingsPage } from './SettingsPage'
import { MobileTabBar } from '../components/common/MobileTabBar'
import { GameLoadScreen } from '../components/common/GameLoadScreen'
import { AppShellLoadScreen } from './AppShellLoadScreen'
import { getGameLoadProgress } from './game-load-progress'
import { isHotseatModeQuery } from './game-setup-query'
import { SandboxAppLazy } from '../sandbox'
import { buildPlatformPageUrl, type PlatformPage } from '../utils/platform-page-url'
import '../App.css'

const GameContainerApiLazy = lazy(() =>
  import('./GameContainerApi').then((m) => ({ default: m.GameContainerApi })),
)

function getPage(): PlatformPage {
  const params = new URLSearchParams(window.location.search)
  const page = params.get('page')
  if (page === 'game' || page === 'workshop' || page === 'lobby' || page === 'settings' || page === 'login' || page === 'onboarding') return page
  if (params.get('context')) return 'game'
  if (params.get('room') || params.get('transport') === 'ws') return 'game'
  if (isHotseatModeQuery(window.location.search)) return 'game'
  return 'lobby'
}

export function setPage(page: PlatformPage, extraParams?: Record<string, string>) {
  const newUrl = buildPlatformPageUrl(page, extraParams)
  window.history.pushState(null, '', newUrl)
  window.dispatchEvent(new PopStateEvent('popstate'))
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
      if (params.has('context')) {
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
    }
    if (page === 'onboarding' || page === 'login') {
      setPage('lobby')
    }
  }, [loading, page, user])

  if (loading) {
    const { percent, labelKey } = getGameLoadProgress('auth')
    return <GameLoadScreen percent={percent} label={t(labelKey)} />
  }

  if (!user) {
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
