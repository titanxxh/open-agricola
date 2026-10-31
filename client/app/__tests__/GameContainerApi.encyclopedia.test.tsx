// @vitest-environment jsdom
import { withActiveRegistry } from '../../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../../shared/cards/__tests__/card-environment'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientInteractionState, GameSyncPayload } from '../../../shared/contract/protocol/game'
import { createOpeningSession } from '../../../server/__tests__/_helpers/session-fixtures'
import { EngineStack } from '../../../shared/engine'
import { createInitialState } from '../../../shared/session/state-bootstrap'
import { serializeState } from '../../../shared/session/serialization'
import { AuthProvider } from '../../contexts/AuthContext'
import { LocaleProvider } from '../../contexts/LocaleContext'
import { loadCardEncyclopedia } from '../../services/card-encyclopedia'
import { encyclopediaBrowseStore } from '../encyclopedia/encyclopedia-browse-store'
import { cardEntry, encyclopediaOf, itemFor } from '../encyclopedia/__tests__/fixtures'
import { GameContainerApi } from '../GameContainerApi'

vi.mock('../../services/card-encyclopedia', () => ({ loadCardEncyclopedia: vi.fn() }))
const load = vi.mocked(loadCardEncyclopedia)

const workPayload = (interaction: ClientInteractionState = { stateId: 'idle', allowedCommands: ['takeAction'], anytimeActions: [] },
  currentPlayerIndex = 0): GameSyncPayload => {
  const state = createInitialState(1523, { playerCount: 2 })
  state.players.forEach((player, index) => {
    player.name = index === 0 ? 'Alice' : 'Bob'
    player.nameIsDefault = false
    player.occupationHand = [`__private_occupation_p${index + 1}__`]
    player.minorHand = [`__private_minor_p${index + 1}__`]
  })
  state.currentPlayerIndex = currentPlayerIndex
  return {
    state: withActiveRegistry(createOfficialCardRegistry(), () => serializeState(state, { actionHooks: undefined, engineStack: new EngineStack() })),
    interaction,
    actionAvailability: { forest: true },
    scores: null,
    historyLength: 0,
    hasActionStartSnapshot: false,
    ok: true,
  }
}
const farmSelect = (requestKey: string, farm: Record<string, unknown>): ClientInteractionState => ({
  stateId: 'wait', requestKey, playerIndex: 0, allowedCommands: ['commitSelection'], anytimeActions: [],
  promptKey: farm.farmType === 'room' ? 'ui.interactionRoomSelect' : 'ui.interactionPlowSelect',
  request: { kind: 'farm-select', farm, options: [{ value: 'confirm', labelKey: 'ui.interactionConfirmButton' }] },
} as ClientInteractionState)
const roomTiles = (tiles: Array<[number, number]>) => ({
  farmType: 'room', selectableTiles: tiles.map(([row, col]) => ({ row, col })), maxSelections: 2,
})
const draftPayload = (): GameSyncPayload => {
  const session = createOpeningSession({
    seed: 42,
    options: { draftMode: 'simultaneous', draftPoolSize: 7 },
    expected: { phase: 'draft', roundPhase: 'work', interaction: { stateId: 'idle' } },
  })
  try {
    return { ...workPayload(), state: session.withCtx(() => serializeState(session.state, {})),
      interaction: { stateId: 'idle', allowedCommands: [], anytimeActions: [] } }
  } finally { session.dispose() }
}

// Mock only the socket boundary; the container, transport, sync and farm UI are real.
class GameSocket {
  static readonly OPEN = 1
  static latest: GameSocket
  static hotseat = false
  static payload: GameSyncPayload
  static version = 1
  static sent: Array<Record<string, unknown>> = []
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
    GameSocket.emit({ type: 'stateUpdate', roomId: 'room-1523', version: GameSocket.version,
      sync: 'snapshot', cause: 'action', payload, emittedAt: Date.now() })
  }

  send(raw: string) {
    const message = JSON.parse(raw) as Record<string, unknown>
    GameSocket.sent.push(message)
    queueMicrotask(() => {
      if (message.type === 'getCommandScope') {
        GameSocket.emit({ type: 'commandScope', scope: {
          scopeId: '01800000-0000-4000-8000-000000001523', expiresAt: Date.now() + 86400000,
        } })
      } else if (message.type === 'joinRoom') {
        GameSocket.emit({ type: 'roomJoined', roomId: 'room-1523', playerIndex: 0,
          hotseat: GameSocket.hotseat, status: 'playing', maxPlayers: 2, playerColors: ['red', 'blue'],
          players: [{ playerIndex: 0, name: 'Alice', connected: true }, { playerIndex: 1, name: 'Bob', connected: true }] })
        GameSocket.snapshot()
      } else if (message.type === 'getGameEndProposal') {
        GameSocket.emit({ type: 'gameEndProposal', roomId: 'room-1523', proposal: null })
      } else if (message.type === 'getState') {
        GameSocket.emit({ type: 'stateUpdate', roomId: 'room-1523', version: GameSocket.version,
          sync: 'snapshot', cause: 'reconnect', requestId: message.requestId,
          payload: GameSocket.payload, emittedAt: Date.now() })
      }
    })
  }

  close() { this.onclose?.(new CloseEvent('close', { code: 1000 })) }
}

const ruleCommands = () => GameSocket.sent.filter(message =>
  !['getCommandScope', 'joinRoom', 'getState', 'getHistory', 'getGameEndProposal'].includes(String(message.type)),
)
const renderGame = () => render(
  <LocaleProvider><AuthProvider><GameContainerApi /></AuthProvider></LocaleProvider>,
)
const entry = () => screen.getByRole('button', { name: 'Look up cards' })
const panel = () => screen.queryByRole('dialog', { name: 'Card Encyclopedia' })
const tile = (container: HTMLElement, key: string) =>
  container.querySelector(`[data-farm-tile-player="p1"][data-farm-tile-key="${key}"]`)!
const nextFrames = () => act(async () => {
  for (let frame = 0; frame < 3; frame += 1) await new Promise(resolve => window.requestAnimationFrame(resolve))
})

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  window.localStorage.setItem('open-agricola-locale-v2', 'en')
  window.history.replaceState(null, '', '/?page=game&transport=ws&room=room-1523')
  GameSocket.hotseat = false
  GameSocket.payload = workPayload()
  GameSocket.version = 1
  GameSocket.sent = []
  load.mockResolvedValue(encyclopediaOf(Array.from({ length: 30 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0')
    return itemFor(cardEntry(`T${number}_Entry`, `T${number}`, { group: 'A', text: { name: [{ literal: `Entry ${number}` }] } }))
  })))
  vi.stubGlobal('WebSocket', GameSocket)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => new Response(JSON.stringify(
    String(url).includes('/api/rooms/locate') ? { wsPath: '/nodes/local/ws' } : { user: null },
  ))))
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
    removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
})
afterEach(() => {
  cleanup()
  encyclopediaBrowseStore.reset()
  load.mockReset()
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('in-game encyclopedia host', () => {
  it('keeps the game mounted and its farm draft while the panel opens, refreshes and closes', async () => {
    const user = userEvent.setup()
    GameSocket.payload = workPayload(farmSelect('rooms', roomTiles([[0, 0], [0, 1], [0, 2]])))
    const { container } = renderGame()
    await screen.findByRole('region', { name: 'Action Spaces' })
    const layout = container.querySelector('.game-layout')
    await user.click(tile(container, '0-0'))
    await user.click(tile(container, '0-1'))
    expect(container.querySelectorAll('[data-farm-tile-player="p1"].selected')).toHaveLength(2)

    await user.click(entry())
    expect(panel()).toHaveAttribute('open')
    await screen.findByRole('heading', { name: 'Results: 30' })
    act(() => GameSocket.snapshot(workPayload(farmSelect('rooms', roomTiles([[0, 1], [0, 2]])))))
    expect(panel()).toHaveAttribute('open')
    await user.click(screen.getByRole('button', { name: 'Close encyclopedia' }))

    expect(panel()).toBeNull()
    expect(entry()).toHaveFocus()
    expect(container.querySelector('.game-layout')).toBe(layout)
    expect(tile(container, '0-0')).not.toHaveClass('selected')
    expect(tile(container, '0-1')).toHaveClass('selected')
    expect(ruleCommands()).toEqual([])
  })

  it('holds back a new interaction while the panel is open and reveals it once the player returns', async () => {
    const user = userEvent.setup()
    const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    GameSocket.payload = workPayload({ stateId: 'idle', allowedCommands: [], anytimeActions: [] }, 1)
    const { container } = renderGame()
    await screen.findByRole('region', { name: 'Action Spaces' })
    await user.click(entry())
    await screen.findByRole('heading', { name: 'Results: 30' })

    act(() => GameSocket.snapshot(workPayload(farmSelect('plow', { farmType: 'plow', selectableTiles: [{ row: 0, col: 2 }] }))))
    await nextFrames()

    expect(await screen.findByText('Your action is needed')).toBeInTheDocument()
    expect(scroll).not.toHaveBeenCalled()
    expect(container.querySelector('[data-interaction-focused]')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Back to game' }))

    expect(panel()).toBeNull()
    expect(entry()).toHaveFocus()
    await waitFor(() => expect(container.querySelector('[data-interaction-focus="farm"][data-focus-player="p1"]'))
      .toHaveAttribute('data-interaction-focused', 'true'))
    expect(scroll).toHaveBeenCalledOnce()
    expect(tile(container, '0-2')).not.toHaveClass('selected')
    expect(ruleCommands()).toEqual([])
  })

  it('keeps unconfirmed draft picks while a peer submits behind the panel', async () => {
    const user = userEvent.setup()
    GameSocket.payload = draftPayload()
    const { container } = renderGame()
    const occupation = await waitFor(() => {
      const card = container.querySelector<HTMLElement>('.draft-pool-row-occ .draft-card')
      if (!card) throw new Error('Expected the draft pool')
      return card
    })
    await user.click(occupation)
    await user.click(container.querySelector<HTMLElement>('.draft-pool-row-minor .draft-card')!)
    expect(container.querySelectorAll('.draft-card.selected')).toHaveLength(2)

    await user.click(entry())
    const submitted = structuredClone(GameSocket.payload)
    const draft = submitted.state.draft!
    draft.pendingPicks.p2 = { occ: draft.pools.p2!.occ[0]!, minor: draft.pools.p2!.minor[0]! }
    act(() => GameSocket.snapshot(submitted))
    expect(panel()).toHaveAttribute('open')
    await user.click(screen.getByRole('button', { name: 'Close encyclopedia' }))

    expect(container.querySelectorAll('.draft-card.selected')).toHaveLength(2)
    expect(ruleCommands()).toEqual([])
  })

  it('comes back open after a short disconnect with the browse state and a still-valid draft', async () => {
    const user = userEvent.setup()
    GameSocket.payload = workPayload(farmSelect('rooms', roomTiles([[0, 0], [0, 1], [0, 2]])))
    const { container } = renderGame()
    await screen.findByRole('region', { name: 'Action Spaces' })
    await user.click(tile(container, '0-0'))
    await user.click(entry())
    await screen.findByRole('heading', { name: 'Results: 30' })
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    const dropped = GameSocket.latest

    act(() => dropped.close())
    expect(await screen.findByText('Reconnecting and restoring your game…')).toBeInTheDocument()

    expect(await screen.findByText('Page 2 of 2', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(GameSocket.latest).not.toBe(dropped)
    expect(panel()).toHaveAttribute('open')
    expect(screen.queryByText('Your action is needed')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Close encyclopedia' }))
    expect(entry()).toHaveFocus()
    expect(tile(container, '0-0')).toHaveClass('selected')
    expect(ruleCommands()).toEqual([])
  })

  it('reminds the player when the reconnect brings a new window and drops the withdrawn draft', async () => {
    const user = userEvent.setup()
    GameSocket.payload = workPayload(farmSelect('rooms', roomTiles([[0, 0], [0, 1], [0, 2]])))
    const { container } = renderGame()
    await screen.findByRole('region', { name: 'Action Spaces' })
    await user.click(tile(container, '0-0'))
    await user.click(entry())
    await screen.findByRole('heading', { name: 'Results: 30' })

    GameSocket.payload = workPayload()
    act(() => GameSocket.latest.close())
    await screen.findByText('Reconnecting and restoring your game…')

    expect(await screen.findByText('Your action is needed', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(panel()).toHaveAttribute('open')
    await user.click(screen.getByRole('button', { name: 'Back to game' }))
    expect(panel()).toBeNull()
    expect(tile(container, '0-0')).not.toHaveClass('selected')
    expect(ruleCommands()).toEqual([])
  })

  it('has no entry on the hotseat handoff and closes the panel when the device changes hands', async () => {
    const user = userEvent.setup()
    GameSocket.hotseat = true
    window.history.replaceState(null, '', '/?page=game&transport=ws&room=room-1523&hotseat=1&player=p1&devMode=1')
    renderGame()
    await screen.findByRole('dialog', { name: 'Hotseat handoff' })
    expect(screen.queryByRole('button', { name: 'Look up cards' })).toBeNull()
    await user.click(screen.getByRole('button', { name: "I'm Alice — continue" }))
    await user.click(entry())
    expect(panel()).toHaveAttribute('open')

    act(() => GameSocket.snapshot(workPayload({ stateId: 'idle', allowedCommands: ['takeAction'], anytimeActions: [] }, 1)))

    await screen.findByRole('dialog', { name: 'Hotseat handoff' })
    expect(panel()).toBeNull()
    expect(screen.queryByRole('button', { name: 'Look up cards' })).toBeNull()
    await user.click(screen.getByRole('button', { name: "I'm Bob — continue" }))
    expect(entry()).toBeInTheDocument()
    expect(panel()).toBeNull()
  })
})
