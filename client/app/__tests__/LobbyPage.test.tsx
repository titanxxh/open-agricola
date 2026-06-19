// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LobbyPage } from '../LobbyPage'
import { setPage } from '../PageRouter'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', username: 'host', displayName: 'Host' },
    token: null,
    logout: vi.fn(),
  }),
}))

vi.mock('../../contexts/LocaleContext', () => {
  const labels: Record<string, string> = {
    'platform.lobbyTitle': 'Lobby',
    'platform.tabSettings': 'Settings',
    'platform.logout': 'Logout',
    'platform.startGame': 'Start Game',
    'platform.createMultiplayer': 'Create Multiplayer Game',
    'platform.singlePlayer': 'Single Player',
    'platform.selectPlayerCount': 'Select number of players',
    'platform.players2': '2 Players',
    'platform.players3': '3 Players',
    'platform.players4': '4 Players',
    'platform.players5': '5 Players',
    'platform.players6': '6 Players',
    'platform.draftModeLabel': 'Card draft',
    'platform.draftModeNone': 'Random hand',
    'platform.draftModeSimultaneous': 'Simultaneous draft',
    'platform.createGame': 'Create Game',
    'platform.cancel': 'Cancel',
    'platform.joinGame': 'Join Game',
    'platform.joinRoomPlaceholder': 'Enter room ID',
    'platform.joinBtn': 'Join',
    'platform.workshop': 'Workshop',
    'platform.enterWorkshop': 'Card Workshop',
    'platform.activeRooms': 'Active Rooms',
    'platform.noActiveRoomsTitle': 'No game in progress yet',
    'platform.noActiveRoomsDesc': 'Create a room and invite friends.',
  }
  return {
    useLocale: () => ({
      locale: 'en',
      setLocale: vi.fn(),
      t: (key: string) => labels[key] ?? key,
    }),
  }
})

vi.mock('../PageRouter', () => ({
  setPage: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('LobbyPage player count selection', () => {
  it('offers 2-6 player rooms and sends the selected count to game setup', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, rooms: [] }))))

    render(<LobbyPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create Multiplayer Game' }))

    for (const label of ['2 Players', '3 Players', '4 Players', '5 Players', '6 Players']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }

    fireEvent.click(screen.getByRole('button', { name: '6 Players' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Game' }))

    expect(setPage).toHaveBeenCalledWith('game', {
      transport: 'ws',
      maxPlayers: '6',
    })
  })
})
