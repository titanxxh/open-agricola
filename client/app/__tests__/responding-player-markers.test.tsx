// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { GameSyncPayload } from '../../../shared/contract/protocol/game'
import { markAllWorkersUsed } from '../../../shared/domain/player'
import { t } from '../../../shared/i18n'
import { createWorkSession } from '../../../server/__tests__/_helpers/session-fixtures'
import { AuthProvider } from '../../contexts/AuthContext'
import { LocaleProvider } from '../../contexts/LocaleContext'
import { GameContainerApi } from '../GameContainerApi'

const namePlayers = (state: { players: Array<{ name: string; nameIsDefault?: boolean }> }) => {
  state.players[0]!.name = 'Alice'
  state.players[1]!.name = 'Bob'
  state.players[0]!.nameIsDefault = false
  state.players[1]!.nameIsDefault = false
}

const viewOf = (session: ReturnType<typeof createWorkSession>, response: ReturnType<ReturnType<typeof createWorkSession>['getState']>, seat: number) =>
  session.buildSyncPayload(response, [session.state.players[seat]!.id])

const payloads = {
  aliceTurn: null as GameSyncPayload | null,
  confirmSwitch: null as GameSyncPayload | null,
  bobTurn: null as GameSyncPayload | null,
  reactionForAlice: null as GameSyncPayload | null,
  reactionForBob: null as GameSyncPayload | null,
  feedForAlice: null as GameSyncPayload | null,
  feedForBob: null as GameSyncPayload | null,
}

beforeAll(() => {
  const work = createWorkSession({ configure: namePlayers })
  try {
    payloads.aliceTurn = viewOf(work, work.getState(), 0)
    const placed = work.takeAction(0, 'forest')
    payloads.confirmSwitch = viewOf(work, placed, 0)
    const passed = work.resolveChoice(0, 'confirm')
    payloads.bobTurn = viewOf(work, passed, 0)
  } finally { work.dispose() }

  const reaction = createWorkSession({ configure(state) {
    namePlayers(state)
    const responder = state.players[1]!
    responder.houseType = 'clay'
    responder.occupationPlayed = ['A128_RiparianBuilder']
    Object.assign(responder.resources, { wood: 5, clay: 10, reed: 6 })
    state.actionSpaces.find(space => space.id === 'reed-bank')!.resources.reed = 3
  } })
  try {
    reaction.takeAction(0, 'reed-bank')
    const prompted = reaction.resolveChoice(0, 'confirm')
    payloads.reactionForAlice = viewOf(reaction, prompted, 0)
    payloads.reactionForBob = viewOf(reaction, prompted, 1)
  } finally { reaction.dispose() }

  const feeding = createWorkSession({ configure(state) {
    namePlayers(state)
    state.round = 4
    state.currentPlayerIndex = 0
    state.players[0]!.startPlayer = false
    state.players[1]!.startPlayer = true
    state.roundFirstPlayerId = state.players[1]!.id
    for (const player of state.players) {
      markAllWorkersUsed(state, player)
      player.resources.food = 0
      player.resources.grain = 1
      player.resources.vegetable = 0
    }
  } })
  try {
    const ended = feeding.performRoundEnd()
    payloads.feedForAlice = viewOf(feeding, ended, 0)
    payloads.feedForBob = viewOf(feeding, ended, 1)
  } finally { feeding.dispose() }
})

class GameSocket {
  static readonly OPEN = 1
  static latest: GameSocket
  static payload: GameSyncPayload
  static version = 1
  static sent: Array<Record<string, unknown>> = []
  static seat = 0
  static hotseat = false
  static controlled: readonly number[] | undefined
  readonly readyState = GameSocket.OPEN
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: (() => void) | null = null

  constructor(_url: string) {
    GameSocket.latest = this
    queueMicrotask(() => this.onopen?.())
  }

  static emit(message: Record<string, unknown>) {
    GameSocket.latest.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) }))
  }

  static snapshot(payload = GameSocket.payload) {
    GameSocket.payload = payload
    GameSocket.version += 1
    GameSocket.emit({
      type: 'stateUpdate', roomId: 'room-1882', version: GameSocket.version,
      sync: 'snapshot', cause: 'reconnect', payload, emittedAt: Date.now(),
    })
  }

  send(raw: string) {
    const message = JSON.parse(raw) as Record<string, unknown>
    GameSocket.sent.push(message)
    queueMicrotask(() => {
      if (message.type === 'getCommandScope') {
        GameSocket.emit({ type: 'commandScope', scope: {
          scopeId: '01800000-0000-4000-8000-000000001882', expiresAt: Date.now() + 86400000,
        } })
      } else if (message.type === 'joinRoom') {
        const audience = GameSocket.controlled
          ? { controlledPlayerIndexes: GameSocket.controlled, visiblePlayerIds: GameSocket.controlled.map(index => `p${index + 1}`) }
          : {}
        GameSocket.emit({
          type: 'roomJoined', roomId: 'room-1882', playerIndex: GameSocket.seat, ...audience,
          hotseat: GameSocket.hotseat, status: 'playing', maxPlayers: 2,
          playerColors: GameSocket.payload.state.players.map(player => player.color),
          players: GameSocket.payload.state.players.map((player, playerIndex) => ({ playerIndex, name: player.name, connected: true })),
        })
        GameSocket.snapshot()
      } else if (message.type === 'getGameEndProposal') {
        GameSocket.emit({ type: 'gameEndProposal', roomId: 'room-1882', proposal: null })
      } else if (message.type === 'getState') {
        GameSocket.emit({
          type: 'stateUpdate', roomId: 'room-1882', version: GameSocket.version,
          sync: 'snapshot', cause: 'reconnect', requestId: message.requestId,
          payload: GameSocket.payload, emittedAt: Date.now(),
        })
      } else if (message.commandContext && typeof message.commandContext === 'object') {
        const context = message.commandContext as { commandId: string }
        GameSocket.snapshot()
        GameSocket.emit({
          type: 'commandReceipt', status: 'completed', requestId: message.requestId,
          receipt: { commandId: context.commandId, outcome: { ok: true, roomId: 'room-1882', roomVersion: GameSocket.version } },
        })
      }
    })
  }

  close() { this.onclose?.(new CloseEvent('close', { code: 1000 })) }
}

const setupViewport = (mobile: boolean) => {
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: mobile ? query === '(max-width: 900px)' : query === '(min-width: 1101px)',
    media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
}

const renderSeat = async (payload: GameSyncPayload, options: {
  mobile: boolean
  seat?: number
  hotseat?: boolean
  controlled?: readonly number[]
  ready?: 'board' | 'handoff'
}) => {
  GameSocket.payload = payload
  GameSocket.version = 1
  GameSocket.sent = []
  GameSocket.seat = options.seat ?? 0
  GameSocket.hotseat = options.hotseat ?? false
  GameSocket.controlled = options.controlled
  document.title = 'Open Agricola'
  setupViewport(options.mobile)
  const view = render(
    <LocaleProvider><AuthProvider><GameContainerApi /></AuthProvider></LocaleProvider>,
  )
  if (options.ready === 'handoff') await screen.findByRole('dialog', { name: 'Hotseat handoff' })
  else await screen.findByRole('region', { name: 'Action Spaces' })
  return view
}

const currentLabel = t('en', 'ui.currentPlayer')
const turnTitle = /^[◢◣◤◥] /

const expectTurnMarkers = async (container: HTMLElement, responder: string, startPlayer: string, mobile: boolean) => {
  const farmTabs = [...container.querySelectorAll('.player-tabs-container .player-tab')]
  const turn = farmTabs.filter(tab => tab.classList.contains('is-current-turn'))
  const star = farmTabs.filter(tab => tab.querySelector('.start-marker.current'))
  const other = responder === 'Alice' ? 'Bob' : 'Alice'
  expect(turn.length).toBeGreaterThan(0)
  for (const tab of turn) {
    expect(tab).toHaveTextContent(responder)
    expect(tab).not.toHaveTextContent(other)
    expect(tab).toHaveAttribute('aria-current', 'true')
  }
  expect(farmTabs.filter(tab => tab.textContent?.includes(other) && tab.classList.contains('is-current-turn'))).toHaveLength(0)
  expect(star.length).toBeGreaterThan(0)
  for (const tab of star) expect(tab).toHaveTextContent(startPlayer)
  const overviews = [...container.querySelectorAll('.desktop-player-overview__player.is-current-turn')]
  expect(overviews).toHaveLength(1)
  expect(overviews[0]).toHaveTextContent(responder)
  expect(overviews[0]?.querySelector('.turn-marker')).toHaveAccessibleName(currentLabel)
  if (mobile) {
    const user = userEvent.setup()
    const trigger = screen.getByRole('button', { name: /Switch player view/ })
    if (trigger.getAttribute('aria-expanded') !== 'true') await user.click(trigger)
    const options = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(options.find(option => option.textContent?.includes(responder))).toHaveTextContent(currentLabel)
    expect(options.find(option => option.textContent?.includes(responder === 'Alice' ? 'Bob' : 'Alice'))).not.toHaveTextContent(currentLabel)
  } else {
    expect(screen.getByRole('tab', { name: new RegExp(responder) })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('tab', { name: new RegExp(responder === 'Alice' ? 'Bob' : 'Alice') })).not.toHaveAttribute('aria-current')
  }
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  document.title = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('responding player markers', () => {
  beforeAll(() => {
    expect(payloads.reactionForAlice?.state.currentPlayerIndex).toBe(0)
    expect(payloads.reactionForAlice?.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1 })
    expect(payloads.reactionForAlice?.waitingSeatIndexes).toEqual([0])
    expect(payloads.reactionForAlice?.state.players[1]!.occupationHand).toEqual(['?'])
    expect(payloads.feedForAlice?.state.currentPlayerIndex).toBe(0)
    expect(payloads.feedForAlice?.state.players.map(player => player.startPlayer)).toEqual([false, true])
    expect(payloads.feedForAlice?.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1 })
    expect(payloads.feedForAlice?.waitingSeatIndexes).toEqual([1])
    expect(payloads.feedForAlice?.state.players[1]!.minorHand).toEqual(['?'])
    expect(payloads.bobTurn?.state.currentPlayerIndex).toBe(1)
    expect(payloads.bobTurn?.interaction.stateId).toBe('idle')
    expect(payloads.confirmSwitch?.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(payloads.confirmSwitch?.state.currentPlayerIndex).toBe(0)
  })

  it.each([false, true])('follows the work-rotation player while nobody else is being asked, mobile=%s', async mobile => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&transport=ws&room=room-1882')
    vi.stubGlobal('WebSocket', GameSocket)
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => new Response(JSON.stringify(
      String(url).includes('/api/rooms/locate') ? { wsPath: '/nodes/local/ws' } : { user: null },
    ))))
    const alice = await renderSeat(payloads.aliceTurn!, { mobile })
    expect(alice.container.querySelector('.dev-panel')).toBeNull()
    await expectTurnMarkers(alice.container, 'Alice', 'Alice', mobile)
    expect(alice.container.querySelector('.status-badge.your-turn')).toBeTruthy()
    expect(alice.container.querySelector('[data-action-id="forest"] button')).toBeEnabled()
    await waitFor(() => expect(document.title).toMatch(turnTitle))
    const user = userEvent.setup()
    await user.click(alice.container.querySelector('[data-action-id="forest"] button')!)
    await waitFor(() => expect(GameSocket.sent.some(message => message.type === 'action' && message.spaceId === 'forest')).toBe(true))

    act(() => GameSocket.snapshot(payloads.confirmSwitch!))
    await expectTurnMarkers(alice.container, 'Alice', 'Alice', mobile)
    expect(alice.container.querySelector('.status-badge.your-turn')).toBeTruthy()

    act(() => GameSocket.snapshot(payloads.bobTurn!))
    await expectTurnMarkers(alice.container, 'Bob', 'Alice', mobile)
    expect(alice.container.querySelector('.status-badge.waiting-turn')).toHaveTextContent(
      t('en', 'ui.waitingForPlayerAction', { player: 'Bob' }),
    )
    expect(alice.container.querySelector('[data-action-id="clay-pit"] button')).toBeDisabled()
    await waitFor(() => expect(document.title).toBe('Open Agricola'))
    expect(payloads.bobTurn!.state.currentPlayerIndex).toBe(1)
  })

  it.each([false, true])('marks the cross-player responder rather than the work-rotation player, mobile=%s', async mobile => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&transport=ws&room=room-1882')
    vi.stubGlobal('WebSocket', GameSocket)
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => new Response(JSON.stringify(
      String(url).includes('/api/rooms/locate') ? { wsPath: '/nodes/local/ws' } : { user: null },
    ))))
    const alice = await renderSeat(payloads.reactionForAlice!, { mobile })
    await expectTurnMarkers(alice.container, 'Bob', 'Alice', mobile)
    expect(alice.container.querySelector('.status-badge.waiting-turn')).toHaveTextContent('Bob')
    expect(alice.container.querySelector('[data-action-id="forest"] button')).toBeDisabled()
    expect(alice.container.querySelector('.dev-panel')).toBeNull()
    await waitFor(() => expect(document.title).toBe('Open Agricola'))
    expect(payloads.reactionForAlice!.state.currentPlayerIndex).toBe(0)
    expect(payloads.reactionForAlice!.waitingSeatIndexes).toEqual([0])
    cleanup()

    const bob = await renderSeat(payloads.reactionForBob!, { mobile, seat: 1 })
    await expectTurnMarkers(bob.container, 'Bob', 'Alice', mobile)
    expect(bob.container.querySelector('.status-badge.your-turn')).toBeTruthy()
    expect(bob.container.querySelector('[data-action-id="forest"] button')).toBeDisabled()
    await waitFor(() => expect(document.title).toMatch(turnTitle))
    expect(payloads.reactionForBob!.state.players[0]!.occupationHand).toEqual(['?'])
  })

  it.each([false, true])('marks the feeding start player when work rotation is still on the other seat, mobile=%s', async mobile => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&transport=ws&room=room-1882')
    vi.stubGlobal('WebSocket', GameSocket)
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => new Response(JSON.stringify(
      String(url).includes('/api/rooms/locate') ? { wsPath: '/nodes/local/ws' } : { user: null },
    ))))
    const alice = await renderSeat(payloads.feedForAlice!, { mobile })
    await expectTurnMarkers(alice.container, 'Bob', 'Bob', mobile)
    expect(alice.container.querySelector('.status-badge.waiting-turn')).toHaveTextContent('Bob')
    expect(alice.container.querySelector('[data-action-id="forest"] button')).toBeDisabled()
    await waitFor(() => expect(document.title).toBe('Open Agricola'))
    expect(payloads.feedForAlice!.state.currentPlayerIndex).toBe(0)
    cleanup()

    const bob = await renderSeat(payloads.feedForBob!, { mobile, seat: 1 })
    await expectTurnMarkers(bob.container, 'Bob', 'Bob', mobile)
    expect(bob.container.querySelector('.status-badge.your-turn')).toBeTruthy()
    await waitFor(() => expect(document.title).toMatch(turnTitle))
    expect(payloads.feedForBob!.state.players[0]!.minorHand).toEqual(['?'])
  })

  it('flashes a multi-seat owner of the responder and stays quiet for hotseat', async () => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&transport=ws&room=room-1882')
    vi.stubGlobal('WebSocket', GameSocket)
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => new Response(JSON.stringify(
      String(url).includes('/api/rooms/locate') ? { wsPath: '/nodes/local/ws' } : { user: null },
    ))))
    const shared = await renderSeat(payloads.reactionForAlice!, { mobile: false, controlled: [0, 1] })
    await expectTurnMarkers(shared.container, 'Bob', 'Alice', false)
    await waitFor(() => expect(document.title).toMatch(turnTitle))
    expect(shared.container.querySelector('[data-action-id="forest"] button')).toBeDisabled()
    cleanup()

    window.history.replaceState(null, '', '/?page=game&transport=ws&room=room-1882&hotseat=1&player=p1&devMode=1')
    await renderSeat(payloads.reactionForAlice!, { mobile: true, hotseat: true, controlled: [0, 1], ready: 'handoff' })
    expect(screen.getByRole('dialog', { name: 'Hotseat handoff' })).toHaveTextContent('Bob')
    expect(document.querySelector('.farm-grid')).toBeNull()
    await waitFor(() => expect(document.title).toBe('Open Agricola'))
  })
})
