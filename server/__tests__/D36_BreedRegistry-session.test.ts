import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener } from '../../shared/cards/card-listeners'
import { readCardExtraData, readCardInfobox } from '../../shared/cards/helpers/card-state'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'
import { D36_BreedRegistry_impl } from '../../shared/cards/D/D36_BreedRegistry'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { ActionExecutionResult, ActionFlow, GameState, PlayerState } from '../../shared/contract/types'

import '../../shared/cards/D/D36_BreedRegistry'

const CARD_ID = 'D36_BreedRegistry'
const AFTER_COLLECT = D36_BreedRegistry_impl.listeners.find((listener) => listener.id === 'D36-breed-registry-after-collect')!
const AFTER_EXCHANGE = D36_BreedRegistry_impl.listeners.find((listener) => listener.id === 'D36-breed-registry-after-exchange')!

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {},
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { sheep: 1 },
  from: { kind: 'actionSpace', spaceId: 'sheep-market' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
  ...overrides,
})

const exchanged = (
  overrides: Partial<DraftGameEvent<'resource.exchanged'>> = {},
): DraftGameEvent<'resource.exchanged'> => ({
  type: 'resource.exchanged',
  paid: { sheep: 1 },
  gained: { food: 2 },
  paidFrom: { kind: 'player', playerId: 'p1' },
  paidTo: { kind: 'supply' },
  gainedFrom: { kind: 'supply' },
  gainedTo: { kind: 'player', playerId: 'p1' },
  exchangeSource: 'cooking',
  times: 1,
  ...overrides,
})

const executeSpecialEffectLeaves = (
  flow: ActionFlow | undefined,
  state: GameState,
  player: PlayerState,
) => {
  if (!flow) return
  if (flow.type === 'seq') {
    flow.children.forEach((child) => executeSpecialEffectLeaves(child, state, player))
    return
  }
  if (flow.type !== 'leaf' || flow.actionId !== 'special-effect') return
  specialEffectAction.execute({
    state,
    player,
    space: { id: 'test' } as never,
    params: flow.params,
    sourceCard: flow.sourceCard,
    actionContext: flow.actionContext,
  })
}

const setupDirectContext = (
  actionId: 'collect' | 'exchange',
  transactionEvents: Array<DraftGameEvent<'resource.moved'> | DraftGameEvent<'resource.exchanged'>>,
  result?: ActionExecutionResult,
): CardListenerContext => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.id = 'p1'
  player.minorPlayed.push(CARD_ID)

  return {
    state,
    player,
    space: { id: actionId === 'collect' ? 'sheep-market' : 'cooking' },
    actionId,
    phase: 'after',
    transactionEvents,
    result,
  } as unknown as CardListenerContext
}

describe('D36_BreedRegistry session', () => {
  it('keeps the session sheep collect path and records sheepGained', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')
    if (!sheepMarket) throw new Error('sheep-market missing')
    sheepMarket.resources.sheep = 1

    session.loadState(state)

    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(0, 'confirm', [
        { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      ])
    }

    const updated = resp.state.players[0]!
    expect(readCardExtraData<number>(updated, CARD_ID, 'sheepGained')).toBe(1)
    expect(readCardInfobox(updated, CARD_ID)).toBe('1 / 2')
  })

  it('uses action-space resource.moved events to increment sheepGained', () => {
    const ctx = setupDirectContext('collect', [moved({ resources: { sheep: 2 } })], { type: 'ok' })

    const result = executeCardListener(AFTER_COLLECT, ctx)
    executeSpecialEffectLeaves(result?.flow, ctx.state, ctx.player)

    expect(readCardExtraData<number>(ctx.player, CARD_ID, 'sheepGained')).toBe(2)
    expect(readCardInfobox(ctx.player, CARD_ID)).toBe('2 / 2')
  })

  it('ignores non-action-space sheep moves even when result claims sheep gained', () => {
    const ctx = setupDirectContext('collect', [
      moved({ from: { kind: 'supply' } }),
    ], { type: 'ok', resourcesGained: { sheep: 1 } })

    const result = executeCardListener(AFTER_COLLECT, ctx)

    expect(result).toBeUndefined()
  })

  it('does not read prior global state events when current transaction has no sheep moves', () => {
    const ctx = setupDirectContext('collect', [], { type: 'ok', resourcesGained: { sheep: 1 } })
    ctx.state.events = [
      { type: 'worker.placed', actorPlayerId: 'p1', workerId: 'w1', spaceId: 'sheep-market' } as never,
      moved() as never,
    ]

    const result = executeCardListener(AFTER_COLLECT, ctx)

    expect(result).toBeUndefined()
  })

  it('marks sheepConverted from resource.exchanged paid sheep', () => {
    const ctx = setupDirectContext('exchange', [exchanged()], { type: 'ok' })

    const result = executeCardListener(AFTER_EXCHANGE, ctx)
    executeSpecialEffectLeaves(result?.flow, ctx.state, ctx.player)

    expect(readCardExtraData<boolean>(ctx.player, CARD_ID, 'sheepConverted')).toBe(true)
  })

  it('ignores exchange events that do not pay sheep for food', () => {
    const ctx = setupDirectContext('exchange', [
      exchanged({ paid: { boar: 1 }, gained: { food: 2 } }),
    ], { type: 'ok' })

    const result = executeCardListener(AFTER_EXCHANGE, ctx)

    expect(result).toBeUndefined()
  })
})
