import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'

import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { A48_ShavingHorse_impl } from '../../shared/cards/A/A48_ShavingHorse'
import '../../shared/cards/A/A48_ShavingHorse'

const CARD_ID = 'A48_ShavingHorse'
const AFTER_OBTAIN = A48_ShavingHorse_impl.listeners.find((listener) => listener.id === 'A48-shaving-horse-after-obtain')!
const AFTER_EXCHANGE = A48_ShavingHorse_impl.listeners.find((listener) => listener.id === 'A48-shaving-horse-after-exchange')!

type SetupOptions = {
  forestWood?: number
  playerWood?: number
  playerFood?: number
  cardPlayed?: boolean
}

const setup = (options: SetupOptions = {}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  if (options.cardPlayed !== false) {
    player.minorPlayed.push(CARD_ID)
  }
  player.resources.wood = options.playerWood ?? 0
  player.resources.food = options.playerFood ?? 0

  const forest = state.actionSpaces.find((s) => s.id === 'forest')!
  forest.resources.wood = options.forestWood ?? 3

  session.loadState(state)
  return session
}

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {},
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { wood: 1 },
  from: { kind: 'supply' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'gain',
  ...overrides,
})

const exchanged = (
  overrides: Partial<DraftGameEvent<'resource.exchanged'>> = {},
): DraftGameEvent<'resource.exchanged'> => ({
  type: 'resource.exchanged',
  paid: { food: 1 },
  gained: { wood: 1 },
  paidFrom: { kind: 'player', playerId: 'p1' },
  paidTo: { kind: 'supply' },
  gainedFrom: { kind: 'supply' },
  gainedTo: { kind: 'player', playerId: 'p1' },
  exchangeSource: 'test',
  ...overrides,
})

const directContext = (
  actionId: 'gain' | 'exchange',
  transactionEvents: DraftGameEvent[],
): CardListenerContext => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.id = 'p1'
  player.minorPlayed.push(CARD_ID)
  player.resources.wood = 5
  return {
    state,
    player,
    space: state.actionSpaces.find((space) => space.id === 'forest')!,
    actionId,
    phase: 'after',
    transactionEvents,
    actionEvents: transactionEvents,
    result: { type: 'ok', resourcesGained: { wood: 1 } },
  } as unknown as CardListenerContext
}

describe('A48_ShavingHorse session', () => {
  it('does not trigger when card not played', () => {
    const session = setup({ forestWood: 3, playerWood: 4, cardPlayed: false })
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.wood).toBe(7)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('does not trigger when total wood < 5 after collect', () => {
    const session = setup({ forestWood: 3, playerWood: 1 })
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.wood).toBe(4)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('does not trigger when collect returns 0 wood (empty space)', () => {
    const session = setup({ forestWood: 0, playerWood: 6 })
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.wood).toBe(6)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('offers optional exchange when wood reaches 5', () => {
    const session = setup({ forestWood: 3, playerWood: 2 }) // after collect: 5
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.options).toHaveLength(2)
    // player resources not yet charged
    expect(resp.state.players[0]!.resources.wood).toBe(5)
    expect(resp.state.players[0]!.resources.food).toBe(0)

    // Accept (first option is the action node; '__skip__' is the decline option)
    const acceptOption = (resp.interaction.options ?? []).find((o) => o.value !== '__skip__')!
    const resp2 = session.resolveChoice(0, acceptOption.value)
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.resources.wood).toBe(4)
    expect(resp2.state.players[0]!.resources.food).toBe(3)
  })

  it('decline option keeps wood and grants no food', () => {
    const session = setup({ forestWood: 3, playerWood: 2 })
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const resp2 = session.resolveChoice(0, '__skip__')
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.resources.wood).toBe(5)
    expect(resp2.state.players[0]!.resources.food).toBe(0)
  })

  it('forces mandatory exchange when wood reaches 7', () => {
    const session = setup({ forestWood: 3, playerWood: 4 }) // after collect: 7
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    // No choice prompt — mandatory flow runs through automatically
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.wood).toBe(6)
    expect(resp.state.players[0]!.resources.food).toBe(3)
  })

  it('uses resource.moved events to offer exchange even without result gains', () => {
    const ctx = directContext('gain', [moved()])
    ctx.result = { type: 'ok' }

    const result = executeCardListener(AFTER_OBTAIN, ctx)

    expect(result?.flow?.type).toBe('seq')
    expect(result?.flow?.optional).toBe(true)
  })

  it('uses resource.exchanged events to offer exchange even without result gains', () => {
    const ctx = directContext('exchange', [exchanged()])
    ctx.result = { type: 'ok' }

    const result = executeCardListener(AFTER_EXCHANGE, ctx)

    expect(result?.flow?.type).toBe('seq')
    expect(result?.flow?.optional).toBe(true)
  })

  it('does not trigger without a current wood event even when result reports wood', () => {
    const ctx = directContext('gain', [])

    const result = executeCardListener(AFTER_OBTAIN, ctx)

    expect(result).toBeUndefined()
  })

  it('has cost { wood: 1 } aligned with BGA', async () => {
    const mod = await import('../../shared/cards/A/A48_ShavingHorse')
    expect(mod.A48_ShavingHorse.cost).toEqual({ wood: 1 })
  })

  it('triggers once after a batched future receive adds wood', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })
    const playerA = state.players[0]!
    const playerB = state.players[1]!
    playerA.startPlayer = true
    playerA.minorPlayed.push(CARD_ID)
    playerA.resources.wood = 4
    setActiveWorkerCount(playerB, 0)
    state.futureMeeples = [
      {
        id: 'future-a48-wood',
        cardId: 'X_FutureWood',
        playerId: playerA.id,
        round: 2,
        actionId: null,
        resources: { wood: 1 },
      },
      {
        id: 'future-a48-clay',
        cardId: 'X_FutureClay',
        playerId: playerA.id,
        round: 2,
        actionId: null,
        resources: { clay: 1 },
      },
    ]

    session.loadState(state)
    const resp = session.performRoundEnd()

    expect(resp.state.players[0]!.resources.wood).toBe(5)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionOptionalAction')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined)
      .toBe(CARD_ID)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.options : [])
      .toHaveLength(2)
  })
})
