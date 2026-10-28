// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LobbyPage } from '../LobbyPage'
import { setPage } from '../../utils/platform-page-url'
import { startRoomCreation } from '../../services/room-creation'

vi.mock('../../services/room-creation', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/room-creation')>(),
  startRoomCreation: vi.fn(), resumePendingRoomCreation: () => null,
}))

const myRoomsResponse = vi.hoisted(() => ({ rooms: [] as unknown[] }))
const apiFetch = vi.hoisted(() => vi.fn(async (path: string) => new Response(JSON.stringify({
  ok: true, rooms: path === '/api/lobby/my-rooms' ? myRoomsResponse.rooms : [],
  players: [{ id: 'Guest_ID-2', username: 'guest', displayName: 'Guest' }],
}))))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', username: 'host', displayName: 'Host' },
    logout: vi.fn(),
    apiFetch,
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
    'solo.entry': 'Solo game',
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
    'platform.snakeOpening': 'Snake opening',
    'platform.enableParentCards': 'Enable Parent Cards expansion',
    'platform.enableThroughTheSeasons': 'Enable Through the Seasons expansion',
    'platform.enableFarmersOfTheMoor': 'Enable Farmers of the Moor expansion',
    'platform.moorBalanceRules': 'Moor balance rules',
    'platform.moorBalanceRulesHint': 'Apply BGA optional card balance rules',
    'platform.allowIncompleteFarmersOfTheMoorMinorDeal': 'Allow an incomplete Farmers of the Moor minor improvement pool',
    'platform.snakeOpeningHint': 'Every player starts with 3 food. In round 1, each player’s second person is placed in reverse turn order.',
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
    'platform.me': 'Me',
    'platform.statusWaiting': 'Waiting',
    'platform.gameStartedAt': 'Started',
    'platform.roomCreatedAt': 'Created',
    'platform.playerColors.red': 'Red',
    'platform.playerColors.blue': 'Blue',
    'ui.waitingForPlayerAction': 'Waiting for {player} to act',
    'platform.roomAccessLabel': 'Who can enter',
    'platform.roomAccessPublic': 'Public',
    'platform.roomAccessInvited': 'Invited players only',
    'platform.invitedPlayerIdsLabel': 'Invited players',
    'platform.invitedPlayerCountError': 'Select {count} other players',
  }
  return {
    useCurrentLocale: () => 'en',
    useLocale: () => ({
      locale: 'en',
      setLocale: vi.fn(),
      t: (key: string, params: Record<string, string> = {}) => Object.entries(params)
        .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), labels[key] ?? key),
    }),
  }
})

vi.mock('../../utils/platform-page-url', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../utils/platform-page-url')>(),
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
  it('identifies games by their players, colors, start time and current player instead of UUID', async () => {
    const startedAt = Date.UTC(2026, 9, 27, 8, 30)
    myRoomsResponse.rooms = [{
      id: '96725f41-b719-4474-a3df-90e5d239108b', status: 'playing', max_players: 2,
      updated_at: startedAt + 60_000, created_at: startedAt - 60_000, started_at: startedAt,
      player_index: 0, my_turn: 0, current_player_index: 1,
      players: [
        { playerIndex: 0, name: 'Alice', color: 'red' },
        { playerIndex: 1, name: 'Bob', color: 'blue' },
      ],
    }]

    render(<LobbyPage />)

    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Red' })).toHaveAttribute('data-player-color', 'red')
    expect(screen.getByRole('img', { name: 'Blue' })).toHaveAttribute('data-player-color', 'blue')
    expect(screen.getByText('Waiting for Bob to act')).toBeInTheDocument()
    expect(document.querySelector('time')).toHaveAttribute('datetime', '2026-10-27T08:30:00.000Z')
    expect(screen.queryByText(/96725f41/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(setPage).toHaveBeenCalledWith('game', { room: '96725f41-b719-4474-a3df-90e5d239108b' })
  })

  it('creates solo through its fixed one-player settings without navigating before commitment', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, rooms: [] }))))
    vi.mocked(startRoomCreation).mockReturnValueOnce(new Promise(() => undefined))
    render(<LobbyPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Solo game' }))
    expect(screen.getByText('1 player')).toBeVisible()
    fireEvent.click(screen.getByRole('radio', { name: /Choose 7 from 10/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start solo game' }))
    expect(startRoomCreation).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ maxPlayers: 1, soloHandMode: 'choose-7', name: 'Host' }))
    expect(setPage).not.toHaveBeenCalled()
  })
  it('shows a your-turn badge on rooms waiting for the player', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, rooms: [] }))))
    myRoomsResponse.rooms = [
      { id: 'room-a', status: 'playing', max_players: 2, updated_at: 2, player_index: 1, my_turn: 1,
        created_at: 1, started_at: 1, current_player_index: 1, players: [] },
      { id: 'room-b', status: 'playing', max_players: 2, updated_at: 1, player_index: 0, my_turn: 0,
        created_at: 1, started_at: 1, current_player_index: null, players: [] },
    ]

    render(<LobbyPage />)

    await screen.findByText('Your turn')
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]!).getByText('Your turn')).toBeInTheDocument()
    expect(within(items[1]!).queryByText('Your turn')).toBeNull()
    expect(within(items[1]!).getByText('Playing')).toBeInTheDocument()
    fireEvent.click(within(items[0]!).getByRole('button', { name: 'Resume' }))
    expect(setPage).toHaveBeenCalledWith('game', { room: 'room-a' })
  })

  it('shows creation time while a room is waiting to start', async () => {
    myRoomsResponse.rooms = [{
      id: 'waiting-room', status: 'waiting', max_players: 2, updated_at: 1,
      player_index: 0, my_turn: 0, created_at: Date.UTC(2026, 9, 27), started_at: null,
      current_player_index: null, players: [{ playerIndex: 0, name: 'Alice', color: 'red' }],
    }]
    render(<LobbyPage />)
    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Created', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Waiting', { exact: true })).toBeInTheDocument()
    expect(screen.queryByText('Started', { exact: false })).toBeNull()
    expect(screen.queryByText('Your turn')).toBeNull()
  })
})

describe('LobbyPage player count selection', () => {
  it('clears the optional balance choice when Moor is unchecked and forwards the final selection', () => {
    render(<LobbyPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create Multiplayer Game' }))
    expect(screen.queryByRole('checkbox', { name: 'Moor balance rules' })).toBeNull()
    const moor = screen.getByRole('checkbox', { name: 'Enable Farmers of the Moor expansion' })
    fireEvent.click(moor)
    expect(screen.getByRole('checkbox', { name: 'Moor balance rules' })).not.toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Moor balance rules' }))
    fireEvent.click(moor)
    expect(screen.queryByRole('checkbox', { name: 'Moor balance rules' })).toBeNull()
    fireEvent.click(moor)
    expect(screen.getByRole('checkbox', { name: 'Moor balance rules' })).not.toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Moor balance rules' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Game' }))
    expect(setPage).toHaveBeenCalledWith('game', expect.objectContaining({
      enableFarmersOfTheMoor: 'true', enableMoorBalanceRules: 'true',
    }))
  })
  it('uses authenticated room listing and creates a private room from a selected player name', async () => {
    render(<LobbyPage />)
    expect(apiFetch).toHaveBeenCalledWith('/api/rooms')
    fireEvent.click(screen.getByRole('button', { name: 'Create Multiplayer Game' }))
    expect(screen.getByRole('radio', { name: 'Public' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'Invited players only' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Invited players' }), { target: { value: 'Gu' } })
    fireEvent.click(await screen.findByRole('option', { name: /Guest/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Game', exact: true }))
    expect(setPage).toHaveBeenCalledWith('game', expect.objectContaining({
      maxPlayers: '2', roomAccess: 'invited', invitedUserIds: 'Guest_ID-2',
    }))
  })

  it('requires enough distinct invitees for the selected player count', () => {
    render(<LobbyPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create Multiplayer Game' }))
    fireEvent.click(screen.getByRole('button', { name: '3 Players' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Invited players only' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Invited players' }), { target: { value: 'Guest' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Game', exact: true }))
    expect(screen.getByRole('alert')).toHaveTextContent('Select 2 other players')
    expect(setPage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('radio', { name: 'Public' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Game', exact: true }))
    expect(setPage).toHaveBeenCalledWith('game', { transport: 'ws', maxPlayers: '3', enableSnakeOpening: 'true' })
  })

  it('preserves the development identity when starting a hotseat game', () => {
    window.history.replaceState(null, '', '/?player=p1&devMode=1')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, rooms: [] }))))
    render(<LobbyPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Local Hotseat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start Hotseat Game' }))
    expect(setPage).toHaveBeenCalledWith('game', expect.objectContaining({
      hotseat: '1', player: 'p1', devMode: '1',
    }))
    window.history.replaceState(null, '', '/')
  })

  it('uses the Open Agricola wordmark as the home link', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, rooms: [] }))))

    render(<LobbyPage />)

    const link = screen.getByRole('link', { name: 'Open Agricola: Back to Lobby' })
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
      enableSnakeOpening: 'true',
    })
  })

  it('offers the same player counts and expansions for a local hotseat game', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, rooms: [] }))))

    render(<LobbyPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Local Hotseat' }))

    expect(screen.getByText('Play every seat on one device.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '4 Players' }))
    fireEvent.click(screen.getByLabelText('Enable Farmers of the Moor expansion'))
    fireEvent.click(screen.getByRole('button', { name: 'Start Hotseat Game' }))

    // Hotseat is an ordinary room, flagged so one device can hold every seat.
    expect(setPage).toHaveBeenCalledWith('game', {
      transport: 'ws',
      hotseat: '1',
      maxPlayers: '4',
      enableFarmersOfTheMoor: 'true',
      enableSnakeOpening: 'true',
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
      enableSnakeOpening: 'true',
    })
  })

  it('enables Snake opening by default and drops it from game setup when unchecked', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, rooms: [] }))))

    render(<LobbyPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create Multiplayer Game' }))

    const snakeOpening = screen.getByRole('checkbox', { name: /Snake opening/ })
    expect(snakeOpening).toBeChecked()
    expect(screen.getByText('Every player starts with 3 food. In round 1, each player’s second person is placed in reverse turn order.'))
      .toBeInTheDocument()

    fireEvent.click(snakeOpening)
    expect(snakeOpening).not.toBeChecked()
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
    fireEvent.click(screen.getByLabelText('Enable Through the Seasons expansion'))
    fireEvent.click(screen.getByRole('button', { name: 'Create Game' }))

    expect(setPage).toHaveBeenCalledWith('game', {
      transport: 'ws',
      maxPlayers: '2',
      enableThroughTheSeasons: 'true',
      enableSnakeOpening: 'true',
    })
  })

  it('sends Farmers of the Moor with incomplete minor deal and compatible variants', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, rooms: [] }))))

    render(<LobbyPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create Multiplayer Game' }))
    fireEvent.click(screen.getByLabelText('Enable Parent Cards expansion'))
    fireEvent.click(screen.getByLabelText('Enable Through the Seasons expansion'))
    fireEvent.click(screen.getByLabelText('Enable Farmers of the Moor expansion'))
    fireEvent.click(screen.getByLabelText('Allow an incomplete Farmers of the Moor minor improvement pool'))
    fireEvent.click(screen.getByRole('button', { name: 'Create Game' }))

    expect(setPage).toHaveBeenCalledWith('game', {
      transport: 'ws',
      maxPlayers: '2',
      enableParentCards: 'true',
      enableThroughTheSeasons: 'true',
      enableFarmersOfTheMoor: 'true',
      allowIncompleteFarmersOfTheMoorMinorDeal: 'true',
      enableSnakeOpening: 'true',
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
    fireEvent.click(screen.getByRole('checkbox', { name: /Enable community cards/ }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /Reviewed Card/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Game' }))

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/workshop/cards?scope=room&page=1'))
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/workshop/cards?scope=room&page=2'))
    expect(setPage).toHaveBeenCalledWith('game', {
      transport: 'ws',
      maxPlayers: '2',
      enableCommunityDeck: 'true',
      customCards: 'reviewed-card-1',
      enableSnakeOpening: 'true',
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

    const communityDeck = screen.getByRole('checkbox', { name: /Enable community cards/ })
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
      enableSnakeOpening: 'true',
    })

    fireEvent.click(communityDeck)
    expect(await screen.findByRole('checkbox', { name: /Reviewed Card/ })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Create Game' }))
    expect(setPage).toHaveBeenLastCalledWith('game', {
      transport: 'ws',
      maxPlayers: '2',
      enableCommunityDeck: 'true',
      customCards: 'reviewed-card-1',
      enableSnakeOpening: 'true',
    })
  })
})
