// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { LobbyPage } from '../LobbyPage'
import { setPage } from '../../utils/platform-page-url'
import { startRoomCreation } from '../../services/room-creation'
import { CommandRejectedError } from '../../services/gameTransport'

vi.mock('../../services/room-creation', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/room-creation')>(),
  startRoomCreation: vi.fn(async () => ({ roomId: 'created-team' })), resumePendingRoomCreation: () => null,
}))

const accountFeatures = vi.hoisted(() => ({ value: ['team-modes'] as string[], betaAccess: false }))
const refreshSession = vi.hoisted(() => vi.fn())
const myRoomsResponse = vi.hoisted(() => ({ rooms: [] as unknown[] }))
const apiFetch = vi.hoisted(() => vi.fn(async (path: string) => new Response(JSON.stringify({
  ok: true, games: [], rooms: path === '/api/lobby/my-rooms' ? myRoomsResponse.rooms : [],
  protocolVersion: 1,
  entry: path === '/api/prerelease/entry' ? { kind: 'available', channel: 'prerelease', startUrl: 'https://pre.agricola.test/open-agricola/auth/start', returnTo: `${window.location.origin}/` } : undefined,
  players: [{ id: 'Guest_ID-2', username: 'guest', displayName: 'Guest' }],
}))))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', username: 'host', displayName: 'Host', betaAccess: accountFeatures.betaAccess, experimentalFeatures: accountFeatures.value },
    logout: vi.fn(),
    apiFetch,
    refreshSession,
  }),
}))

vi.mock('../../contexts/LocaleContext', async () => {
  const { t: message } = await import('../../../shared/i18n')
  const labels: Record<string, string> = {
    'prerelease.entry': 'Enter prerelease',
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
    'ui.draft.waitingForPlayers': 'Waiting for: {players}',
    'platform.roomAccessLabel': 'Who can enter',
    'platform.roomAccessPublic': 'Public',
    'platform.roomAccessInvited': 'Invited players only',
    'platform.invitedPlayerIdsLabel': 'Invited players',
    'platform.invitedPlayerCountError': 'Select {count} other players',
    'platform.mainNavigation': 'Main navigation',
    'ui.encyclopedia.title': 'Card Encyclopedia',
  }
  return {
    useCurrentLocale: () => 'en',
    useLocale: () => ({
      locale: 'en',
      setLocale: vi.fn(),
      t: (key: string, params: Record<string, string> = {}) => Object.entries(params)
        .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), labels[key] ?? message('en', key)),
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
  accountFeatures.value = ['team-modes']
  accountFeatures.betaAccess = false
})

describe('LobbyPage main navigation', () => {
  it('offers prerelease to a qualified account independently of team availability', async () => {
    accountFeatures.betaAccess = true
    accountFeatures.value = []
    render(<LobbyPage />)
    expect(await screen.findByRole('link', { name: 'Enter prerelease' })).toHaveAttribute('target', '_blank')
  })

  const encyclopediaLink = () => within(screen.getByRole('navigation', { name: 'Main navigation' }))
    .getByRole('link', { name: 'Card Encyclopedia' })

  /** Reports whether the browser would follow the link, then stops jsdom from trying. */
  const clickFollowsLink = (link: HTMLElement, init?: MouseEventInit) => {
    let follows = false
    const observe = (event: Event) => {
      follows = !event.defaultPrevented
      event.preventDefault()
    }
    document.addEventListener('click', observe)
    try {
      fireEvent.click(link, init)
    } finally {
      document.removeEventListener('click', observe)
    }
    return follows
  }

  it('opens the card encyclopedia from the header without reloading the app', () => {
    window.history.replaceState(null, '', '/')
    render(<LobbyPage />)

    expect(encyclopediaLink()).toHaveAttribute('href', '/?page=encyclopedia')

    expect(clickFollowsLink(encyclopediaLink())).toBe(false)
    expect(setPage).toHaveBeenCalledExactlyOnceWith('encyclopedia')
  })

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
    ['Shift', { shiftKey: true }],
    ['middle-button', { button: 1 }],
  ])('leaves a %s click to the browser so the encyclopedia can open in another tab', (_case, init) => {
    render(<LobbyPage />)

    expect(clickFollowsLink(encyclopediaLink(), init)).toBe(true)
    expect(setPage).not.toHaveBeenCalled()
  })
})

describe('LobbyPage my active games', () => {
  it('marks every owned seat separately from an alternate current actor', async () => {
    document.title = 'Open Agricola'
    myRoomsResponse.rooms = [{ id: 'multihand', status: 'playing', max_players: 4, updated_at: 2, created_at: 1, started_at: 1,
      teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum' },
      player_index: 0, owned_player_indexes: [0, 2], my_turn: 1, current_player_index: 2, hotseat: false,
      waiting_player_indexes: [2], progress: { phase: 'playing', round: 1 }, expansions: [],
      players: [{ playerIndex: 0, name: 'Alice', color: 'red' }, { playerIndex: 1, name: 'Bob', color: 'blue' },
        { playerIndex: 2, name: 'Cara', color: 'yellow' }, { playerIndex: 3, name: 'Dan', color: 'black' }],
    }]
    render(<LobbyPage />)
    await screen.findByText('Cara')
    expect(document.querySelector('.my-game .beta-badge')).toHaveTextContent('Beta')
    expect(document.querySelectorAll('.my-game__player[data-owned="true"]')).toHaveLength(2)
    expect(document.querySelector('.my-game__player[data-current="true"]')).toHaveTextContent('Cara')
    expect(document.querySelectorAll('.my-game__player small')).toHaveLength(2)
    expect(document.querySelector('.my-game__turn')).toHaveAttribute('data-my-turn', 'true')
    await waitFor(() => expect(document.title).toMatch(/^◢ /))
  })
  it('identifies games by their players, colors, start time and current player instead of UUID', async () => {
    const startedAt = Date.UTC(2026, 9, 27, 8, 30)
    myRoomsResponse.rooms = [{
      id: '96725f41-b719-4474-a3df-90e5d239108b', status: 'playing', max_players: 2,
      updated_at: startedAt + 60_000, created_at: startedAt - 60_000, started_at: startedAt,
      player_index: 0, my_turn: 0, current_player_index: 1, hotseat: false,
      waiting_player_indexes: [1], progress: { phase: 'playing', round: 1 }, expansions: [],
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

  it('names the players still choosing parents the same way a draft names unsubmitted seats', async () => {
    myRoomsResponse.rooms = [{
      id: 'parents', status: 'playing', max_players: 2,
      updated_at: 2, created_at: 1, started_at: 1,
      player_index: 0, my_turn: 0, current_player_index: null, hotseat: false,
      waiting_player_indexes: [1], progress: { phase: 'parent-selection' }, expansions: [],
      players: [
        { playerIndex: 0, name: 'Alice', color: 'red' },
        { playerIndex: 1, name: 'Bob', color: 'blue' },
      ],
    }]

    render(<LobbyPage />)

    expect(await screen.findByText('Waiting for: Bob')).toBeInTheDocument()
    expect(document.querySelector('.my-game__player[data-current="true"]')).toHaveTextContent('Bob')
    expect(screen.queryByText('Playing')).toBeNull()
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
      { id: 'room-a', status: 'playing', max_players: 2, updated_at: 2, player_index: 1, my_turn: 1, hotseat: false,
        created_at: 1, started_at: 1, current_player_index: 1, players: [], waiting_player_indexes: [1], progress: null, expansions: [] },
      { id: 'room-b', status: 'playing', max_players: 2, updated_at: 1, player_index: 0, my_turn: 0, hotseat: false,
        created_at: 1, started_at: 1, current_player_index: null, players: [], waiting_player_indexes: [], progress: null, expansions: [] },
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
      player_index: 0, my_turn: 0, hotseat: false, created_at: Date.UTC(2026, 9, 27), started_at: null,
      current_player_index: null, players: [{ playerIndex: 0, name: 'Alice', color: 'red' }],
      waiting_player_indexes: [], progress: null, expansions: [],
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


describe('team creation options', () => {
  it('marks team entrances and explains Beta only on the creation panel', async () => {
    render(<LobbyPage />)
    expect(within(screen.getByRole('button', { name: 'Team game', exact: true })).getByText('Beta')).toBeVisible()
    expect(within(screen.getByRole('button', { name: 'Multihand game', exact: true })).getByText('Beta')).toBeVisible()
    expect(screen.queryByText(/Team and multihand modes are being tested/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Team game', exact: true }))
    expect(screen.getByText('Team and multihand modes are being tested. Rules and screens may change. Report problems with the in-game bug report.')).toBeVisible()
  })

  it('retains a denied creation on its form and refreshes account feature availability', async () => {
    vi.mocked(startRoomCreation).mockRejectedValueOnce(new CommandRejectedError({ ok: false, code: 'experimental_feature_unavailable' }))
    render(<LobbyPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Team game', exact: true }))
    await userEvent.click(screen.getByRole('button', { name: 'Create Game', exact: true }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Team modes are not available to you. No room was created.')
    expect(refreshSession).toHaveBeenCalledOnce()
    expect(setPage).not.toHaveBeenCalled()
  })

  it('offers legal formats and preserves all shared variants in the team creation query', async () => {
    vi.stubEnv('VITE_ENABLE_COMMUNITY_DECK', 'true')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, hasMore: false, cards: [
      { id: 'team-workshop', name: 'Team Workshop Card', card_type: 'minor', author_name: 'Author' },
    ] }))))
    const user = userEvent.setup()
    render(<LobbyPage />)
    await user.click(screen.getByRole('button', { name: 'Team game', exact: true }))
    expect(screen.queryByRole('button', { name: '2 Players', exact: true })).toBeNull()
    expect(screen.queryByRole('button', { name: '3 Players', exact: true })).toBeNull()
    expect(screen.queryByRole('button', { name: '5 Players', exact: true })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Seats per team' })).toHaveValue('2')
    expect(screen.getByRole('combobox', { name: 'Seat arrangement' })).toHaveValue('separated')
    expect(screen.getByRole('combobox', { name: 'Team scoring' })).toHaveValue('category-min')
    expect(screen.getByRole('combobox', { name: 'Teammate visibility' })).toHaveValue('shared')
    await user.click(screen.getByRole('button', { name: '6 Players', exact: true }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Seats per team' }), '3')
    await user.click(screen.getByRole('button', { name: '4 Players', exact: true }))
    expect(screen.getByRole('combobox', { name: 'Seats per team' })).toHaveValue('2')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Seat arrangement' }), 'random')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Team scoring' }), 'product')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Teammate visibility' }), 'private')
    await user.click(screen.getByRole('button', { name: 'Simultaneous draft', exact: true }))
    await user.click(screen.getByRole('checkbox', { name: /Enable Parent Cards expansion/ }))
    await user.click(screen.getByRole('checkbox', { name: /Enable Through the Seasons expansion/ }))
    await user.click(screen.getByRole('checkbox', { name: /Enable Farmers of the Moor expansion/ }))
    await user.click(screen.getByRole('checkbox', { name: /Moor balance rules/ }))
    await user.click(screen.getByRole('checkbox', { name: /Allow an incomplete Farmers of the Moor/ }))
    await user.click(screen.getByRole('checkbox', { name: /Enable community cards/ }))
    await user.click(await screen.findByRole('checkbox', { name: /Team Workshop Card/ }))
    await user.click(screen.getByRole('button', { name: 'Create Game', exact: true }))
    expect(startRoomCreation).toHaveBeenCalledWith(expect.objectContaining({
      maxPlayers: 4, draftMode: 'simultaneous', enableParentCards: true, enableThroughTheSeasons: true, enableFarmersOfTheMoor: true,
      enableMoorBalanceRules: true, allowIncompleteFarmersOfTheMoorMinorDeal: true, enableCommunityDeck: true, customCardIds: ['team-workshop'], enableSnakeOpening: true,
    }))
    expect(vi.mocked(startRoomCreation).mock.calls.at(-1)?.[0].teamConfig).toEqual({ mode: 'team', seatsPerTeam: 2, seating: 'random', scoring: 'product', teammateVisibility: 'private' })
  })

  it('uses the same format controls for multihand without a teammate visibility option', async () => {
    const user = userEvent.setup()
    render(<LobbyPage />)
    await user.click(screen.getByRole('button', { name: 'Multihand game', exact: true }))
    expect(screen.getByRole('combobox', { name: 'Seats per team' })).toHaveValue('2')
    expect(screen.queryByRole('combobox', { name: 'Teammate visibility' })).toBeNull()
  })
})


describe('experimental feature entries', () => {
  it('hides both team entry points when the server supplies no available features', async () => {
    accountFeatures.value = []
    render(<LobbyPage />)
    expect(screen.queryByRole('button', { name: 'Team game', exact: true })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Multihand game', exact: true })).toBeNull()
    expect(screen.getByRole('button', { name: 'Create Multiplayer Game' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Local Hotseat' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Solo game' })).toBeVisible()
  })
})
