// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LobbyPage } from '../LobbyPage'
import { setPage } from '../PageRouter'

const myRoomsResponse = vi.hoisted(() => ({ rooms: [] as unknown[] }))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', username: 'host', displayName: 'Host' },
    logout: vi.fn(),
    apiFetch: vi.fn(async () => new Response(JSON.stringify({ ok: true, rooms: myRoomsResponse.rooms }))),
  }),
}))

vi.mock('../../contexts/LocaleContext', () => {
  const labels: Record<string, string> = {
    'platform.lobbyTitle': 'Lobby',
    'platform.backToLobbyPlain': 'Back to Lobby',
    'platform.tabSettings': 'Settings',
    'platform.logout': 'Logout',
    'platform.startGame': 'Start Game',
    'platform.createMultiplayer': 'Create Multiplayer Game',
    'platform.localHotseat': 'Local Hotseat',
    'platform.selectPlayerCount': 'Select number of players',
    'platform.players2': '2 Players',
    'platform.players3': '3 Players',
    'platform.players4': '4 Players',
    'platform.players5': '5 Players',
    'platform.players6': '6 Players',
    'platform.draftModeLabel': 'Card draft',
    'platform.draftModeNone': 'Random hand',
    'platform.draftModeSimultaneous': 'Simultaneous draft',
    'platform.reviewedWorkshopCards': 'Reviewed workshop cards',
    'platform.reviewedWorkshopCardsHint': 'Select reviewed cards for this room only.',
    'platform.reviewedWorkshopCardsLoading': 'Loading reviewed cards…',
    'platform.reviewedWorkshopCardsEmpty': 'No reviewed cards are currently available.',
    'platform.reviewedWorkshopCardsError': 'Could not load reviewed cards.',
    'platform.createGame': 'Create Game',
    'platform.startHotseat': 'Start Hotseat Game',
    'platform.hotseatHint': 'Play every seat on one device.',
    'platform.cancel': 'Cancel',
    'platform.joinGame': 'Join Game',
    'platform.joinRoomPlaceholder': 'Enter room ID',
    'platform.joinBtn': 'Join',
    'platform.workshop': 'Workshop',
    'platform.enterWorkshop': 'Card Workshop',
    'platform.activeRooms': 'Active Rooms',
    'platform.noActiveRoomsTitle': 'No game in progress yet',
    'platform.noActiveRoomsDesc': 'Create a room and invite friends.',
    'platform.myActiveGames': 'My Active Games',
    'platform.statusPlaying': 'Playing',
    'platform.yourTurn': 'Your turn',
    'platform.resume': 'Resume',
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
  vi.unstubAllEnvs()
  myRoomsResponse.rooms = []
})

describe('LobbyPage my active games', () => {
  it('shows a your-turn badge on rooms waiting for the player', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, rooms: [] }))))
    myRoomsResponse.rooms = [
      { id: 'room-a', status: 'playing', max_players: 2, updated_at: 2, player_index: 1, my_turn: 1 },
      { id: 'room-b', status: 'playing', max_players: 2, updated_at: 1, player_index: 0, my_turn: 0 },
    ]

    render(<LobbyPage />)

    await screen.findByText('Your turn')
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]!).getByText('Your turn')).toBeInTheDocument()
    expect(within(items[1]!).queryByText('Your turn')).toBeNull()
    expect(within(items[1]!).getByText('Playing')).toBeInTheDocument()
  })
})

describe('LobbyPage player count selection', () => {
  it('uses the Open Agricola wordmark as the home link', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, rooms: [] }))))

    render(<LobbyPage />)

    const link = screen.getByRole('link', { name: 'Back to Lobby' })
    expect(link).toHaveTextContent('Open Agricola')
    expect(link).toHaveAttribute('href', import.meta.env.BASE_URL)
  })

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

  it('offers the same player counts and expansions for a local hotseat game', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, rooms: [] }))))

    render(<LobbyPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Local Hotseat' }))

    expect(screen.getByText('Play every seat on one device.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '4 Players' }))
    fireEvent.click(screen.getByLabelText('启用 Farmers of the Moor 扩展'))
    fireEvent.click(screen.getByRole('button', { name: 'Start Hotseat Game' }))

    // No transport=ws: hotseat stays on the HTTP session instead of opening a room.
    expect(setPage).toHaveBeenCalledWith('game', {
      hotseat: '1',
      maxPlayers: '4',
      enableFarmersOfTheMoor: 'true',
    })
  })

  it('keeps the multiplayer entry on the room transport', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, rooms: [] }))))

    render(<LobbyPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create Multiplayer Game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Game' }))

    expect(setPage).toHaveBeenCalledWith('game', {
      transport: 'ws',
      maxPlayers: '2',
    })
  })

  it('sends the Through the Seasons option to game setup when enabled', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, rooms: [] }))))

    render(<LobbyPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create Multiplayer Game' }))
    fireEvent.click(screen.getByLabelText('启用 Through the Seasons 扩展'))
    fireEvent.click(screen.getByRole('button', { name: 'Create Game' }))

    expect(setPage).toHaveBeenCalledWith('game', {
      transport: 'ws',
      maxPlayers: '2',
      enableThroughTheSeasons: 'true',
    })
  })

  it('sends Farmers of the Moor with incomplete minor deal and compatible variants', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, rooms: [] }))))

    render(<LobbyPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create Multiplayer Game' }))
    fireEvent.click(screen.getByLabelText('启用 Parent Cards 扩展'))
    fireEvent.click(screen.getByLabelText('启用 Through the Seasons 扩展'))
    fireEvent.click(screen.getByLabelText('启用 Farmers of the Moor 扩展'))
    fireEvent.click(screen.getByLabelText('允许 Farmers of the Moor 小改良池不完整'))
    fireEvent.click(screen.getByRole('button', { name: 'Create Game' }))

    expect(setPage).toHaveBeenCalledWith('game', {
      transport: 'ws',
      maxPlayers: '2',
      enableParentCards: 'true',
      enableThroughTheSeasons: 'true',
      enableFarmersOfTheMoor: 'true',
      allowIncompleteFarmersOfTheMoorMinorDeal: 'true',
    })
  })

  it('adds selected reviewed workshop cards to game setup', async () => {
    vi.stubEnv('VITE_ENABLE_COMMUNITY_DECK', 'true')
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/workshop/cards')) {
        return new Response(JSON.stringify({
          ok: true,
          cards: url.includes('page=2') ? [{
            id: 'reviewed-card-1',
            name: 'Reviewed Card',
            card_type: 'minor',
            author_name: 'Alice',
          }] : [],
          page: url.includes('page=2') ? 2 : 1,
          total: 1,
          hasMore: !url.includes('page=2'),
        }))
      }
      return new Response(JSON.stringify({ ok: true, rooms: [] }))
    }))

    render(<LobbyPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create Multiplayer Game' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /启用社区扩展卡/ }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /Reviewed Card/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Game' }))

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/workshop/cards?scope=room&page=1'))
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/workshop/cards?scope=room&page=2'))
    expect(setPage).toHaveBeenCalledWith('game', {
      transport: 'ws',
      maxPlayers: '2',
      enableCommunityDeck: 'true',
      customCards: 'reviewed-card-1',
    })
  })

  it('keeps reviewed card selections hidden and inert while the community deck is disabled', async () => {
    vi.stubEnv('VITE_ENABLE_COMMUNITY_DECK', 'true')
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/workshop/cards')) {
        return new Response(JSON.stringify({
          ok: true,
          cards: [{
            id: 'reviewed-card-1',
            name: 'Reviewed Card',
            card_type: 'minor',
            author_name: 'Alice',
          }],
          page: 1,
          total: 1,
          hasMore: false,
        }))
      }
      return new Response(JSON.stringify({ ok: true, rooms: [] }))
    }))

    render(<LobbyPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create Multiplayer Game' }))

    const communityDeck = screen.getByRole('checkbox', { name: /启用社区扩展卡/ })
    expect(screen.queryByText('Reviewed workshop cards')).toBeNull()
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/workshop/cards'))

    fireEvent.click(communityDeck)
    fireEvent.click(await screen.findByRole('checkbox', { name: /Reviewed Card/ }))
    fireEvent.click(communityDeck)

    expect(screen.queryByText('Reviewed workshop cards')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Create Game' }))
    expect(setPage).toHaveBeenLastCalledWith('game', {
      transport: 'ws',
      maxPlayers: '2',
    })

    fireEvent.click(communityDeck)
    expect(await screen.findByRole('checkbox', { name: /Reviewed Card/ })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Create Game' }))
    expect(setPage).toHaveBeenLastCalledWith('game', {
      transport: 'ws',
      maxPlayers: '2',
      enableCommunityDeck: 'true',
      customCards: 'reviewed-card-1',
    })
  })
})
