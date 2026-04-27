import { lazy, Suspense, useEffect, useState, type ReactElement } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { LoginPage } from './LoginPage'
import { LobbyPage } from './LobbyPage'
import { SettingsPage } from './SettingsPage'
import { GameContainerApi } from './GameContainerApi'
import { MobileTabBar } from '../components/common/MobileTabBar'

const WorkshopPage = lazy(() => import('./WorkshopPage').then(m => ({ default: m.WorkshopPage })))

type Page = 'login' | 'lobby' | 'workshop' | 'game' | 'settings'

const PAGE_SCOPED_QUERY_KEYS = [
  'card',
  'room',
  'player',
  'playerId',
  'transport',
  'maxPlayers',
  'draftMode',
  'draftPoolSize',
  'enableCommunityDeck',
  'customCards',
  'embedded',
  'devMode',
]

function getPage(): Page {
  const params = new URLSearchParams(window.location.search)
  const page = params.get('page')
  if (page === 'game' || page === 'workshop' || page === 'lobby' || page === 'settings') return page
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

  if (loading) {
    return <div className="loading-screen">{t('platform.loading')}</div>
  }

  if (!user) {
    return <LoginPage />
  }

  const page = getPage()

  let pageNode: ReactElement
  switch (page) {
    case 'game':
      pageNode = <GameContainerApi />
      break
    case 'workshop':
      pageNode = (
        <Suspense fallback={<div className="loading-screen">{t('platform.loading')}</div>}>
          <WorkshopPage />
        </Suspense>
      )
      break
    case 'settings':
      pageNode = <SettingsPage />
      break
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
