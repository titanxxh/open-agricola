// @vitest-environment jsdom
import { withActiveRegistry } from '../../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../../shared/cards/__tests__/card-environment'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameSyncPayload } from '../../../shared/contract/protocol/game'
import { createWorkSession } from '../../../server/__tests__/_helpers/session-fixtures'
import { EngineStack } from '../../../shared/engine'
import { createInitialState } from '../../../shared/session/state-bootstrap'
import { serializeState } from '../../../shared/session/serialization'
import { AuthProvider } from '../../contexts/AuthContext'
import { LocaleProvider } from '../../contexts/LocaleContext'
import { GameContainerApi } from '../GameContainerApi'

const workPayload = (): GameSyncPayload => {
  const registry = createOfficialCardRegistry()
  const state = createInitialState(1098, { playerCount: 2 })
  state.players.forEach((player, index) => {
    player.name = index === 0 ? 'Alice' : 'Bob'
    player.nameIsDefault = false
    player.occupationHand = [`__private_occupation_p${index + 1}__`]
    player.minorHand = [`__private_minor_p${index + 1}__`]
  })
  state.players[1]!.fields = [{ row: 0, col: 2, stacks: [] }]
  state.players[1]!.occupationPlayed = ['D099_EarthenwarePotter']
  state.players[1]!.cardStates.D099_EarthenwarePotter = { extraData: { secret: '__private_card_state__' } }
  return {
    state: withActiveRegistry(registry, () => serializeState(state, { actionHooks: undefined, engineStack: new EngineStack() })),
    interaction: { stateId: 'idle', allowedCommands: ['takeAction'], anytimeActions: [] },
    actionAvailability: { forest: true },
    scores: null,
    historyLength: 0,
    hasActionStartSnapshot: false,
    ok: true,
  }
}

// Mock only the socket boundary; the container, transport, sync and farm UI are real.
class GameSocket {
  static readonly OPEN = 1
  static latest: GameSocket
  static hotseat = true
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
    GameSocket.emit({ type: 'stateUpdate', roomId: 'room-1098', version: GameSocket.version,
      sync: 'snapshot', cause: 'reconnect', payload, emittedAt: Date.now() })
  }

  send(raw: string) {
    const message = JSON.parse(raw) as Record<string, unknown>
    GameSocket.sent.push(message)
    queueMicrotask(() => {
      if (message.type === 'getCommandScope') {
        GameSocket.emit({ type: 'commandScope', scope: {
          scopeId: '01800000-0000-4000-8000-000000001098', expiresAt: Date.now() + 86400000,
        } })
      } else if (message.type === 'joinRoom') {
        GameSocket.emit({ type: 'roomJoined', roomId: 'room-1098', playerIndex: 0,
          hotseat: GameSocket.hotseat, status: 'playing', maxPlayers: 2, playerColors: ['red', 'blue'],
          players: [{ playerIndex: 0, name: 'Alice', connected: true }, { playerIndex: 1, name: 'Bob', connected: true }] })
        GameSocket.snapshot()
      } else if (message.type === 'getState') {
        GameSocket.emit({ type: 'stateUpdate', roomId: 'room-1098', version: GameSocket.version,
          sync: 'snapshot', cause: 'reconnect', requestId: message.requestId,
          payload: GameSocket.payload, emittedAt: Date.now() })
      } else if (message.commandContext && typeof message.commandContext === 'object') {
        const context = message.commandContext as { commandId: string }
        GameSocket.snapshot()
        GameSocket.emit({ type: 'commandReceipt', status: 'completed', requestId: message.requestId,
          receipt: { commandId: context.commandId, outcome: {
            ok: true, roomId: 'room-1098', roomVersion: GameSocket.version,
          } } })
      }
    })
  }

  close() { this.onclose?.(new CloseEvent('close', { code: 1000 })) }
}

const setupViewport = (mobile: boolean) => {
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: mobile && query === '(max-width: 900px)', media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
    removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
}
const renderGame = () => render(
  <LocaleProvider><AuthProvider><GameContainerApi /></AuthProvider></LocaleProvider>,
)
const confirmAlice = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: "I'm Alice — continue" }))
  await screen.findByRole('region', { name: 'Action Spaces' })
}
const selectBob = async (user: ReturnType<typeof userEvent.setup>, mobile = false) => {
  if (mobile) {
    await user.click(screen.getByRole('button', { name: '切换玩家视角' }))
    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: /Bob/ }))
  } else {
    await user.click(screen.getByRole('tab', { name: /Bob/ }))
  }
}
const choicePayload = (playerIndex: number): GameSyncPayload => ({
  ...workPayload(),
  interaction: {
    stateId: 'wait', playerIndex, allowedCommands: ['resolveChoice'], anytimeActions: [],
    promptKey: 'ui.interactionOptionalAction',
    request: { kind: 'choice', options: [{ value: 'yes', labelKey: 'Private response' }] },
  },
})
const ruleCommands = () => GameSocket.sent.filter(message =>
  !['getCommandScope', 'joinRoom', 'getState', 'getHistory'].includes(String(message.type)),
)

beforeEach(() => {
  window.localStorage.setItem('open-agricola-locale-v2', 'en')
  window.history.replaceState(null, '', '/?page=game&transport=ws&room=room-1098&hotseat=1&player=p1&devMode=1')
  GameSocket.hotseat = true
  GameSocket.payload = workPayload()
  GameSocket.version = 1
  GameSocket.sent = []
  vi.stubGlobal('WebSocket', GameSocket)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => new Response(JSON.stringify(
    String(url).includes('/api/rooms/locate') ? { wsPath: '/nodes/local/ws' } : { user: null },
  ))))
  setupViewport(false)
})
afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('hotseat public farm browsing', () => {
  it('waits for the confirmed seat before focusing its occupation hand and preserves manual browsing on repeated snapshots', async () => {
    const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    const user = userEvent.setup()
    GameSocket.payload = {
      ...workPayload(),
      interaction: {
        stateId: 'wait', playerIndex: 0, allowedCommands: ['resolveChoice'], anytimeActions: [],
        promptKey: 'ui.interactionChooseOccupation',
        request: { kind: 'choice', options: [{ value: '__private_occupation_p1__', labelKey: 'Private occupation' }] },
      },
    }
    const { container } = renderGame()
    await screen.findByRole('dialog', { name: 'Hotseat handoff' })
    expect(container.querySelector('[data-interaction-focus="occupation-hand"]')).not.toBeInTheDocument()
    expect(scroll).not.toHaveBeenCalled()
    await confirmAlice(user)
    await waitFor(() => expect(container.querySelector('[data-interaction-focus="occupation-hand"]')).toHaveAttribute('data-interaction-focused', 'true'))
    expect(scroll).toHaveBeenCalledOnce()
    await selectBob(user)
    act(() => GameSocket.snapshot())
    expect(scroll).toHaveBeenCalledOnce()
    expect(container.querySelector('[data-hand-anchor]')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Bob/ })).toHaveAttribute('aria-selected', 'true')
  })

  it.each([
    { mobile: false, waiting: false },
    { mobile: true, waiting: false },
    { mobile: false, waiting: true },
  ])('hides a private Moor action draft while browsing and restores it on return (mobile=$mobile, waiting=$waiting)', async ({ mobile, waiting }) => {
    setupViewport(mobile)
    const user = userEvent.setup()
    const state = createInitialState(1098, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    state.players.forEach((player, index) => {
      player.name = index === 0 ? 'Alice' : 'Bob'
      player.nameIsDefault = false
    })
    state.players[0]!.farmTerrain = [{ row: 2, col: 1, kind: 'moor' }]
    if (waiting) state.currentPlayerIndex = 1
    GameSocket.payload = {
      ...workPayload(),
      state: withActiveRegistry(createOfficialCardRegistry(), () => serializeState(state, { actionHooks: undefined, engineStack: new EngineStack() })),
      ...(waiting ? {
        interaction: {
          stateId: 'wait', playerIndex: 0, allowedCommands: ['resolveChoice'], anytimeActions: [],
          promptKey: 'ui.interactionOptionalAction', request: { kind: 'choice', options: [{
            value: ['card-action', 'moor-special-1-2-terrain', 'action', 'cut-peat', 2, 1].join(':'),
            labelKey: 'moor.specialActions.cut-peat',
          }] },
        },
      } : {}),
    }
    const { container } = renderGame()
    await confirmAlice(user)
    const card = container.querySelector('[data-card-id="moor-special-1-2-terrain"]')
    if (!card) throw new Error('Expected the two-player Cut Peat special action card')
    const cutPeat = within(card).getByRole('button', { name: 'Cut Peat' })
    expect(cutPeat).toBeEnabled()
    await user.click(cutPeat)
    expect(cutPeat).toHaveAttribute('aria-pressed', 'true')
    expect(cutPeat).toHaveClass('selected')
    expect(container.querySelector('[data-farm-tile-player="p1"][data-farm-tile-key="2-1"]')).toHaveClass('selectable')
    expect(ruleCommands()).toEqual([])

    await selectBob(user, mobile)
    expect(cutPeat).toBeDisabled()
    expect(ruleCommands()).toEqual([])
    expect(cutPeat).toHaveAttribute('aria-pressed', 'false')
    expect(cutPeat).not.toHaveClass('selected')
    expect(container.querySelector('.farm-tile.selectable, .farm-tile.selected')).not.toBeInTheDocument()
    await user.click(cutPeat)
    expect(ruleCommands()).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Return to Alice to continue' }))
    expect(cutPeat).toBeEnabled()
    expect(cutPeat).toHaveAttribute('aria-pressed', 'true')
    expect(cutPeat).toHaveClass('selected')
    expect(container.querySelector('[data-farm-tile-player="p1"][data-farm-tile-key="2-1"]')).toHaveClass('selectable')
    expect(ruleCommands()).toEqual([])

    act(() => GameSocket.snapshot())
    expect(cutPeat).toHaveAttribute('aria-pressed', 'false')
    expect(cutPeat).not.toHaveClass('selected')
  })

  it('hides private improvement candidates and affordability hints in the public supply, then restores them on return', async () => {
    const user = userEvent.setup()
    const payload = choicePayload(0)
    if (payload.interaction.stateId !== 'wait' || payload.interaction.request.kind !== 'choice') throw new Error('Expected choice fixture')
    const [candidate, unavailable] = payload.state.availableMajorImprovements
    if (!candidate || !unavailable) throw new Error('Expected public major supply')
    payload.interaction.promptKey = 'ui.interactionChooseImprovement'
    payload.interaction.request.options = [{ value: candidate, labelKey: 'Private improvement' }]
    // Projection keys combine card type and id; this fixture does not parse choice values.
    payload.cardAvailability = {
      [['major', candidate].join(':')]: true,
      [['major', unavailable].join(':')]: false,
    }
    GameSocket.payload = payload
    const { container } = renderGame()
    await confirmAlice(user)
    const supply = () => container.querySelector('.major-improvements')!
    const card = (id: string) => supply().querySelector(`[data-id="${id}"]`)!.closest('.player-card')!
    expect(supply()).toHaveClass('expanded')
    expect(card(candidate)).toHaveClass('selectable')
    expect(card(unavailable)).toHaveClass('unselectable')

    await selectBob(user)
    expect(container.querySelectorAll('.major-improvements')).toHaveLength(1)
    expect(supply()).toHaveClass('collapsed')
    await user.click(within(supply()).getByRole('button'))
    expect(supply().querySelector('.selectable, .unselectable, .disabled')).not.toBeInTheDocument()
    await user.click(card(candidate))
    expect(ruleCommands()).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Return to Alice to continue' }))
    expect(container.querySelectorAll('.major-improvements')).toHaveLength(1)
    expect(card(candidate)).toHaveClass('selectable')
    expect(card(unavailable)).toHaveClass('unselectable')
  })

  it('does not project private extra-placement candidates onto the shared action board while browsing', async () => {
    const user = userEvent.setup()
    const payload = choicePayload(0)
    if (payload.interaction.stateId !== 'wait' || payload.interaction.request.kind !== 'choice') throw new Error('Expected choice fixture')
    payload.interaction.promptKey = 'ui.interactionPlaceFarmerExtra'
    payload.interaction.request.options = [{ value: 'forest', labelKey: 'Private placement' }]
    GameSocket.payload = payload
    const { container } = renderGame()
    await confirmAlice(user)
    const hints = () => container.querySelectorAll('.choice-available, .choice-unavailable')
    expect(hints().length).toBeGreaterThan(0)
    await selectBob(user)
    expect(hints()).toHaveLength(0)
    expect(ruleCommands()).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Return to Alice to continue' }))
    expect(hints().length).toBeGreaterThan(0)
  })

  it('uses the mobile player picker for the same public view and return behavior', async () => {
    setupViewport(true)
    const user = userEvent.setup()
    const { container } = renderGame()
    await confirmAlice(user)
    await selectBob(user, true)
    expect(screen.getByRole('button', { name: '切换玩家视角' })).toHaveTextContent('Bob')
    expect(container.querySelector('[data-farm-tile-player="p2"].field')).toBeVisible()
    expect(container.querySelector('[data-hand-anchor]')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Return to Alice to continue' }))
    expect(screen.getByRole('button', { name: '切换玩家视角' })).toHaveTextContent('Alice')
    expect(container.querySelector('[data-hand-anchor="p1"]')).toBeVisible()
    expect(ruleCommands()).toEqual([])
  })

  it('retains the browsed farm across same-responder updates without displaying private requests', async () => {
    const user = userEvent.setup()
    const { container } = renderGame()
    await confirmAlice(user)
    await selectBob(user)
    act(() => GameSocket.snapshot(choicePayload(0)))
    expect(screen.getByRole('tab', { name: /Bob/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('button', { name: 'Private response' })).not.toBeInTheDocument()
    expect(container.querySelector('[data-hand-anchor]')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Return to Alice to continue' }))
    expect(screen.getByRole('button', { name: 'Private response' })).toBeEnabled()
  })

  it('keeps a farm draft on its responder, preserves it on return, and clears it on a new authoritative interaction', async () => {
    const user = userEvent.setup()
    const payload = workPayload()
    payload.interaction = {
      stateId: 'wait', playerIndex: 0, allowedCommands: ['commitSelection'], anytimeActions: [],
      promptKey: 'ui.interactionPlowSelect', request: { kind: 'farm-select',
        farm: { farmType: 'plow', selectableTiles: [{ row: 0, col: 2 }] },
      },
    }
    GameSocket.payload = payload
    const { container } = renderGame()
    await confirmAlice(user)
    const selectedTile = () => container.querySelector('[data-farm-tile-player="p1"][data-farm-tile-key="0-2"]')!
    await user.click(selectedTile())
    expect(selectedTile()).toHaveClass('selected')
    await selectBob(user)
    expect(container.querySelector('.farm-tile.selectable, .farm-tile.selected')).not.toBeInTheDocument()
    await user.click(container.querySelector('[data-farm-tile-player="p2"][data-farm-tile-key="0-2"]')!)
    expect(ruleCommands()).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Return to Alice to continue' }))
    expect(selectedTile()).toHaveClass('selected')
    await selectBob(user)
    act(() => GameSocket.snapshot(workPayload()))
    expect(screen.getByRole('tab', { name: /Bob/ })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('button', { name: 'Return to Alice to continue' }))
    expect(selectedTile()).not.toHaveClass('selected')
    expect(ruleCommands()).toEqual([])
  })

  it('covers reconnecting snapshots and preserves same-room confirmation and browsing, but hands off to a changed responder', async () => {
    const user = userEvent.setup()
    const { container } = renderGame()
    await confirmAlice(user)
    await selectBob(user)
    act(() => GameSocket.latest.close())
    expect(container.querySelector('.farm-grid')).not.toBeInTheDocument()
    expect(container.querySelector('[data-hand-anchor]')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('tab', { name: /Bob/ })).toHaveAttribute('aria-selected', 'true'), { timeout: 3000 })
    expect(screen.queryByRole('dialog', { name: 'Hotseat handoff' })).not.toBeInTheDocument()
    expect(container.querySelector('[data-hand-anchor]')).not.toBeInTheDocument()
    GameSocket.payload = choicePayload(1)
    act(() => GameSocket.latest.close())
    await user.click(await screen.findByRole('button', { name: "I'm Bob — continue" }, { timeout: 3000 }))
    expect(container.querySelector('[data-hand-anchor="p2"]')).toBeVisible()
  })

  it('requires a new handoff after a page remount and defaults to the responder, not the previous farm', async () => {
    const user = userEvent.setup()
    const first = renderGame()
    await confirmAlice(user)
    await selectBob(user)
    first.unmount()
    const { container } = renderGame()
    expect(await screen.findByRole('dialog', { name: 'Hotseat handoff' })).toBeVisible()
    expect(container.querySelector('.farm-grid')).not.toBeInTheDocument()
    await confirmAlice(user)
    expect(screen.getByRole('tab', { name: /Alice/ })).toHaveAttribute('aria-selected', 'true')
  })

  it.each(['draft', 'parent-selection'] as const)('keeps %s as a private dedicated opening without farm browsing', async phase => {
    const user = userEvent.setup()
    const state = createInitialState(1098, { playerCount: 2,
      ...(phase === 'draft' ? { draftMode: 'simultaneous' as const } : { enableParentCards: true }),
    })
    state.players.forEach((player, index) => {
      player.name = index === 0 ? 'Alice' : 'Bob'
      player.nameIsDefault = false
    })
    GameSocket.payload.state = withActiveRegistry(createOfficialCardRegistry(), () => serializeState(state, { actionHooks: undefined, engineStack: new EngineStack() }))
    const { container } = renderGame()
    await user.click(await screen.findByRole('button', { name: "I'm Alice — continue" }))
    expect(screen.queryByRole('dialog', { name: 'Hotseat handoff' })).not.toBeInTheDocument()
    expect(container.querySelector(phase === 'draft' ? '.draft-overlay' : '.parent-selection-overlay')).toBeVisible()
    expect(container.querySelector('.farm-grid')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('leaves ordinary multiplayer browsing and own-seat command permissions unchanged', async () => {
    GameSocket.hotseat = false
    window.history.replaceState(null, '', '/?page=game&transport=ws&room=room-1098&player=p1')
    const user = userEvent.setup()
    const { container } = renderGame()
    await screen.findByRole('region', { name: 'Action Spaces' })
    await selectBob(user)
    expect(screen.getByRole('tab', { name: /Bob/ })).toHaveAttribute('aria-selected', 'true')
    expect(container.querySelector('[data-action-id="forest"] button')).toBeDisabled()
    expect(container.querySelector('[data-hand-anchor]')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Hotseat handoff' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /Alice/ }))
    const action = container.querySelector('[data-action-id="forest"] button')!
    expect(action).toBeEnabled()
    await user.click(action)
    expect(ruleCommands()).toEqual([expect.objectContaining({ type: 'action', spaceId: 'forest' })])
  })

  it('shows private notifications only to their confirmed recipient and never during public browsing', async () => {
    const user = userEvent.setup()
    GameSocket.payload.privateEvents = ['p1', 'p2'].map(recipientPlayerId => ({
      schemaVersion: 1, type: 'private.promptShown', recipientPlayerId, promptKind: 'choice',
      sourceCard: `__secret_${recipientPlayerId}__`,
    }))
    renderGame()
    await confirmAlice(user)
    expect((await screen.findAllByText('Private prompt from __secret_p1__.'))[0]).toBeVisible()
    expect(screen.queryAllByText('Private prompt from __secret_p2__.')).toHaveLength(0)
    await selectBob(user)
    expect(screen.queryAllByText('Private prompt from __secret_p1__.')).toHaveLength(0)
    act(() => GameSocket.snapshot(choicePayload(1)))
    await user.click(await screen.findByRole('button', { name: "I'm Bob — continue" }))
    expect(screen.queryAllByText('Private prompt from __secret_p1__.')).toHaveLength(0)
  })

  it('preserves an unfinished private choice draft without displaying or submitting it on another farm', async () => {
    const user = userEvent.setup()
    const payload = choicePayload(0)
    if (payload.interaction.stateId !== 'wait' || payload.interaction.request.kind !== 'choice') throw new Error('Expected choice fixture')
    payload.interaction.request.multiSelect = { valuePrefix: 'select:', minSelections: 1, maxSelections: 1 }
    GameSocket.payload = payload
    renderGame()
    await confirmAlice(user)
    await user.click(screen.getByRole('checkbox', { name: 'Private response' }))
    await selectBob(user)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirm/ })).not.toBeInTheDocument()
    expect(ruleCommands()).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Return to Alice to continue' }))
    expect(screen.getByRole('checkbox', { name: 'Private response' })).toBeChecked()
  })

  it('preserves actual baking recipes and the owner draft while browsing another public farm', async () => {
    const session = createWorkSession({ seed: 42, configure: state => {
      state.players[0]!.name = 'Alice'
      state.players[1]!.name = 'Bob'
      state.players.forEach(player => { player.nameIsDefault = false })
      state.players[0]!.improvements = ['Major_Fireplace1', 'Major_ClayOven']
      Object.assign(state.players[0]!.resources, { grain: 2, food: 0 })
      state.players[1]!.improvements = ['Major_StoneOven']
      Object.assign(state.players[1]!.resources, { grain: 9, food: 20 })
    } })
    try {
      const response = session.takeAction(0, 'grain-utilization')
      expect(response.ok, response.error).toBe(true)
      GameSocket.payload = session.buildSyncPayload(response, null, 'debug')
      const user = userEvent.setup()
      const { container } = renderGame()
      await confirmAlice(user)
      const oven = () => [...container.querySelectorAll('.exchange-row')].find(row => row.textContent?.includes('Clay Oven'))!
      expect(oven().querySelector('.exchange-rate')).toHaveTextContent('5')
      await user.click(within(oven() as HTMLElement).getByRole('button', { name: '+', exact: true }))
      expect(within(oven() as HTMLElement).getByRole('button', { name: '+', exact: true })).toBeDisabled()
      await selectBob(user)
      expect(container.querySelector('.exchange-overlay')).not.toBeInTheDocument()
      expect(ruleCommands()).toEqual([])
      await user.click(screen.getByRole('button', { name: 'Return to Alice to continue' }))
      expect(oven().querySelector('.exchange-rate')).toHaveTextContent('5')
      expect(within(oven() as HTMLElement).getByRole('button', { name: '+', exact: true })).toBeDisabled()
      expect([...container.querySelectorAll('.exchange-row')].some(row => row.textContent?.includes('Stone Oven'))).toBe(false)
      expect(session.state.players[0]!.resources).toMatchObject({ grain: 2, food: 0 })
      expect(session.state.players[1]!.resources).toMatchObject({ grain: 9, food: 20 })
    } finally { session.dispose() }
  })

  it('hands off to the waiting responder, even when browsing that farm, and invalidates the old confirmation', async () => {
    const user = userEvent.setup()
    const { container } = renderGame()
    await confirmAlice(user)
    await selectBob(user)
    act(() => GameSocket.snapshot(choicePayload(1)))
    expect(await screen.findByRole('button', { name: "I'm Bob — continue" })).toBeVisible()
    expect(container.querySelector('.farm-grid')).not.toBeInTheDocument()
    expect(container.querySelector('[data-hand-anchor]')).not.toBeInTheDocument()
    // Bob did not confirm: returning to Alice must still require a fresh handoff.
    act(() => GameSocket.snapshot(choicePayload(0)))
    await confirmAlice(user)
    act(() => GameSocket.snapshot(choicePayload(1)))
    await user.click(await screen.findByRole('button', { name: "I'm Bob — continue" }))
    expect(screen.getByRole('tab', { name: /Bob/ })).toHaveAttribute('aria-selected', 'true')
    expect(container.querySelector('[data-hand-anchor="p2"]')).toBeVisible()
    expect(container.querySelector('[data-hand-anchor="p1"]')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Private response' })).toBeEnabled()
    expect(ruleCommands()).toEqual([])
  })

  it('browses Bob without changing the confirmed interaction player or exposing private UI', async () => {
    const user = userEvent.setup()
    const { container } = renderGame()
    await screen.findByRole('dialog', { name: 'Hotseat handoff' })
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(container.querySelector('.farm-grid')).not.toBeInTheDocument()
    await confirmAlice(user)
    expect(container.querySelector('[data-hand-anchor="p1"]')).toBeVisible()

    await selectBob(user)

    expect(screen.getByRole('tab', { name: /Bob/ })).toHaveAttribute('aria-selected', 'true')
    expect(container.querySelector('.farm-tile.field')).toBeVisible()
    expect(container.querySelector('.played-cards [data-id="D099_EarthenwarePotter"]')).toBeVisible()
    expect(container.querySelector('[data-hand-anchor]')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Hotseat handoff' })).not.toBeInTheDocument()
    expect(container.textContent).not.toContain('__private_card_state__')
    expect(container.querySelector('.dev-panel')).not.toBeInTheDocument()
    await user.click(container.querySelector('[data-action-id="forest"] button')!)
    expect(ruleCommands()).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Return to Alice to continue' }))
    expect(screen.getByRole('tab', { name: /Alice/ })).toHaveAttribute('aria-selected', 'true')
    expect(container.querySelector('[data-hand-anchor="p1"]')).toBeVisible()
    expect(ruleCommands()).toEqual([])
  })
})
