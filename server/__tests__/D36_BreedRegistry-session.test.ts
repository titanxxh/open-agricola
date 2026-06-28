import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener } from '../../shared/cards/card-listeners'
import { readCardExtraData, readCardInfobox } from '../../shared/cards/helpers/card-state'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'
import { D036_BreedRegistry_impl } from '../../shared/cards/D/D036_BreedRegistry'
import { EngineStack } from '../../shared/engine'
import { serializeStateForPlayer } from '../../shared/session/serialization'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { ActionExecutionResult, ActionFlow, GameState, PlayerState } from '../../shared/contract/types'

import '../../shared/cards/D/D036_BreedRegistry'

const CARD_ID = 'D036_BreedRegistry'
const AFTER_SHEEP_GAIN = D036_BreedRegistry_impl.listeners.find((listener) => listener.id === 'D36-breed-registry-after-sheep-gain')!
const AFTER_EXCHANGE_SHEEP_CONVERSION = D036_BreedRegistry_impl.listeners.find((listener) => listener.id === 'D36-breed-registry-after-exchange-sheep-conversion')!
const AFTER_HARVEST_SHEEP_CONVERSION = D036_BreedRegistry_impl.listeners.find((listener) => listener.id === 'D36-breed-registry-after-harvest-sheep-conversion')!

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

const feedConverted = (
  overrides: Partial<DraftGameEvent<'harvest.feedConverted'>> = {},
): DraftGameEvent<'harvest.feedConverted'> => ({
  type: 'harvest.feedConverted',
  playerId: 'p1',
  source: 'Harvest conversion',
  cost: { sheep: 1 },
  food: { food: 2 },
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
  actionId: 'collect' | 'gain' | 'exchange' | 'harvest-feed-conversion',
  transactionEvents: Array<
    DraftGameEvent<'resource.moved'>
    | DraftGameEvent<'resource.exchanged'>
    | DraftGameEvent<'harvest.feedConverted'>
  >,
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
    phase: actionId === 'harvest-feed-conversion' ? 'immediatelyAfter' : 'after',
    transactionEvents,
    result,
    ownerPlayer: player,
    ownerCardZone: 'played',
  } as unknown as CardListenerContext
}

describe('D036_BreedRegistry session', () => {
  it('keeps the session sheep collect path and records boardSheep from hand', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorHand = [CARD_ID]

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
    expect(readCardExtraData<number>(updated, CARD_ID, 'boardSheep')).toBe(1)
    expect(readCardInfobox(updated, CARD_ID)).toBeUndefined()

    const opponentView = serializeStateForPlayer(resp.state, resp.state.players[1]!.id, { engineStack: new EngineStack() })
    const ownerView = serializeStateForPlayer(resp.state, updated.id, { engineStack: new EngineStack() })
    expect(opponentView.players[0]!.minorHand).toEqual(['?'])
    expect(opponentView.players[0]!.cardStates[CARD_ID]).toBeUndefined()
    expect(opponentView.events.some((event) =>
      event.type === 'card.stateChanged' &&
      event.cardId === CARD_ID &&
      event.targetPlayerId === updated.id,
    )).toBe(false)
    expect(ownerView.players[0]!.cardStates[CARD_ID]?.extraData?.boardSheep).toBe(1)
  })

  it('uses action-space resource.moved events to increment boardSheep', () => {
    const ctx = setupDirectContext('collect', [moved({ resources: { sheep: 2 } })], { type: 'ok' })

    const result = executeCardListener(AFTER_SHEEP_GAIN, ctx)
    executeSpecialEffectLeaves(result?.flow, ctx.state, ctx.player)

    expect(readCardExtraData<number>(ctx.player, CARD_ID, 'boardSheep')).toBe(2)
    expect(readCardInfobox(ctx.player, CARD_ID)).toBe('2 / 2')
  })

  it('uses card resource.moved events to increment cardSheep', () => {
    const ctx = setupDirectContext('gain', [
      moved({
        resources: { sheep: 1 },
        from: { kind: 'card', playerId: 'p1', cardId: 'X_TestSheepCard' },
        reason: 'cardEffect',
      }),
    ], { type: 'ok' })

    const result = executeCardListener(AFTER_SHEEP_GAIN, ctx)
    executeSpecialEffectLeaves(result?.flow, ctx.state, ctx.player)

    expect(readCardExtraData<number>(ctx.player, CARD_ID, 'cardSheep')).toBe(1)
    expect(readCardInfobox(ctx.player, CARD_ID)).toBe('1 / 2')
  })

  it('ignores non-gain sheep moves even when result claims sheep gained', () => {
    const ctx = setupDirectContext('collect', [
      moved({ from: { kind: 'player', playerId: 'p2' } }),
    ], { type: 'ok', resourcesGained: { sheep: 1 } })

    const result = executeCardListener(AFTER_SHEEP_GAIN, ctx)

    expect(result).toBeUndefined()
  })

  it('does not read prior global state events when current transaction has no sheep moves', () => {
    const ctx = setupDirectContext('collect', [], { type: 'ok', resourcesGained: { sheep: 1 } })
    ctx.state.events = [
      { type: 'worker.placed', actorPlayerId: 'p1', workerId: 'w1', spaceId: 'sheep-market' } as never,
      moved() as never,
    ]

    const result = executeCardListener(AFTER_SHEEP_GAIN, ctx)

    expect(result).toBeUndefined()
  })

  it('marks sheepConverted from resource.exchanged paid sheep', () => {
    const ctx = setupDirectContext('exchange', [exchanged()], { type: 'ok' })

    const result = executeCardListener(AFTER_EXCHANGE_SHEEP_CONVERSION, ctx)
    executeSpecialEffectLeaves(result?.flow, ctx.state, ctx.player)

    expect(readCardExtraData<boolean>(ctx.player, CARD_ID, 'sheepConvertedToFood')).toBe(true)
  })

  it('keeps exchange and harvest conversion listeners on separate phases', () => {
    expect(AFTER_EXCHANGE_SHEEP_CONVERSION.phases).toEqual(['after'])
    expect(AFTER_EXCHANGE_SHEEP_CONVERSION.actions).toEqual(['exchange'])
    expect(AFTER_HARVEST_SHEEP_CONVERSION.phases).toEqual(['immediatelyAfter'])
    expect(AFTER_HARVEST_SHEEP_CONVERSION.actions).toEqual(['harvest-feed-conversion'])
  })

  it('marks sheepConverted from harvest.feedConverted sheep cost', () => {
    const ctx = setupDirectContext('harvest-feed-conversion', [feedConverted()], { type: 'ok' })

    const result = executeCardListener(AFTER_HARVEST_SHEEP_CONVERSION, ctx)
    executeSpecialEffectLeaves(result?.flow, ctx.state, ctx.player)

    expect(readCardExtraData<boolean>(ctx.player, CARD_ID, 'sheepConvertedToFood')).toBe(true)
  })

  it('ignores exchange events that do not pay sheep for food', () => {
    const ctx = setupDirectContext('exchange', [
      exchanged({ paid: { boar: 1 }, gained: { food: 2 } }),
    ], { type: 'ok' })

    const result = executeCardListener(AFTER_EXCHANGE_SHEEP_CONVERSION, ctx)

    expect(result).toBeUndefined()
  })

  it('fails No Sheep prerequisite when current animal zones contain sheep', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseAnimalType = 'sheep'
    player.houseAnimalCount = 1

    expect(D036_BreedRegistry_impl.prerequisiteCheck?.(player, state)).toBe(false)
  })
})
