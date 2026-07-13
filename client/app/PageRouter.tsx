import { lazy, Suspense, useEffect, useState, type ReactElement } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { LoginPage } from './LoginPage'
import { LobbyPage } from './LobbyPage'
import { OnboardingPage } from './OnboardingPage'
import { SettingsPage } from './SettingsPage'
import { MobileTabBar } from '../components/common/MobileTabBar'
import { GameLoadScreen } from '../components/common/GameLoadScreen'
import { getGameLoadProgress } from './game-load-progress'
import { SandboxAppLazy } from '../sandbox'
import '../App.css'

const GameContainerApiLazy = lazy(() =>
  import('./GameContainerApi').then((m) => ({ default: m.GameContainerApi })),
)

function GameShellFallback() {
  const { t } = useLocale()
  const { percent, labelKey } = getGameLoadProgress('appShell')
  return <GameLoadScreen percent={percent} label={t(labelKey)} />
}

type Page = 'login' | 'lobby' | 'workshop' | 'game' | 'settings' | 'onboarding'

const PAGE_SCOPED_QUERY_KEYS = [
  'card',
  'view',
  'room',
  'player',
  'playerId',
  'transport',
  'maxPlayers',
  'draftMode',
  'draftPoolSize',
  'enableCommunityDeck',
  'enableParentCards',
  'draftParents',
  'enableThroughTheSeasons',
  'enableFarmersOfTheMoor',
  'allowIncompleteFarmersOfTheMoorMinorDeal',
  'customCards',
  'embedded',
  'devMode',
]

function getPage(): Page {
  const params = new URLSearchParams(window.location.search)
  const page = params.get('page')
  if (page === 'game' || page === 'workshop' || page === 'lobby' || page === 'settings' || page === 'login' || page === 'onboarding') return page
  if (params.get('room') || params.get('transport') === 'ws') return 'game'
  return 'lobby'
}

export function setPage(page: Page, extraParams?: Record<string, string>) {
  const params = new URLSearchParams(window.location.search)
  for (const key of PAGE_SCOPED_QUERY_KEYS) {
    params.delete(key)
  }
  if (page === 'lobby') {
    params.delete('page')
  } else {
    params.set('page', page)
  }
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      params.set(k, v)
    }
  }
  const search = params.toString()
  const newUrl = `${window.location.pathname}${search ? '?' + search : ''}`
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
    if (!loading && user && (page === 'onboarding' || page === 'login')) {
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
        <Suspense fallback={<GameShellFallback />}>
          <GameContainerApiLazy />
        </Suspense>
      )
      break
    case 'workshop':
      pageNode = (
        <Suspense fallback={<div className="loading-screen">{t('platform.loading')}</div>}>
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
