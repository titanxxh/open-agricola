import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { LoginPage } from './LoginPage'
import { LobbyPage } from './LobbyPage'
import { WorkshopPage } from './WorkshopPage'
import { SettingsPage } from './SettingsPage'
import { GameContainerApi } from './GameContainerApi'

type Page = 'login' | 'lobby' | 'workshop' | 'game' | 'settings'

function getPage(): Page {
  const params = new URLSearchParams(window.location.search)
  const page = params.get('page')
  if (page === 'game' || page === 'workshop' || page === 'lobby' || page === 'settings') return page
  // Legacy: if ?room= or ?transport=ws is set, go straight to game
  if (params.get('room') || params.get('transport') === 'ws') return 'game'
  return 'lobby'
}

export function setPage(page: Page, extraParams?: Record<string, string>) {
  const params = new URLSearchParams(window.location.search)
  if (page === 'lobby') {
    // Remove page param and game-specific params
    params.delete('page')
    params.delete('room')
    params.delete('player')
    params.delete('transport')
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
  const [, setTick] = useState(0)

  useEffect(() => {
    const handler = () => setTick(t => t + 1)
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  if (loading) {
    return <div className="loading-screen">加载中...</div>
  }

  if (!user) {
    return <LoginPage />
  }

  const page = getPage()

  switch (page) {
    case 'game':
      return <GameContainerApi />
    case 'workshop':
      return <WorkshopPage />
    case 'settings':
      return <SettingsPage />
    case 'lobby':
    default:
      return <LobbyPage />
  }
}
