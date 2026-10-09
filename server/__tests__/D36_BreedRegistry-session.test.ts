import { type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/D/D084_FeedPellets'

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
  const session = new GameSession(42)
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
    const session = new GameSession(42)
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
    expect(ownerView.players[0]!.cardStates[CARD_ID]).toBeUndefined()
    expect(updated.cardStates[CARD_ID]?.extraData?.boardSheep).toBe(1)
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
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.houseAnimalType = 'sheep'
    player.houseAnimalCount = 1

    expect(D036_BreedRegistry_impl.prerequisiteCheck?.(player, state)).toBe(false)
  })
})

describe('D036 Breed Registry parity', () => {
  const CARD_ID = 'D036_BreedRegistry'

  const FEED_PELLETS = 'D084_FeedPellets'

  const FILLER = '__test_placeholder__'

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const setup = ({
    played = false, sheep = 0, fireplace = false, round = 14, harvest = false,
  }: {
    played?: boolean
    sheep?: number
    fireplace?: boolean
    round?: number
    harvest?: boolean
  } = {}) => {
    const session = new GameSession(6036, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.pastures = []
      player.stableTiles = []
      player.houseAnimalType = null
      player.houseAnimalCount = 0
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
      if (harvest) {
        markAllWorkersUsed(state, player)
        setActiveWorkerCount(player, index === 0 ? 1 : 0)
      } else {
        setWorkersAtHome(state, player, index === 0 ? 2 : 0)
      }
    })
    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    if (sheep > 0) {
      owner.resources.sheep = sheep
      owner.houseAnimalType = 'sheep'
      owner.houseAnimalCount = sheep
    }
    if (fireplace) {
      owner.improvements = ['Major_Fireplace1']
      state.availableMajorImprovements = state.availableMajorImprovements.filter(
        (cardId) => cardId !== 'Major_Fireplace1',
      )
    }
    session.loadState(state)
    return session
  }

  const enterMinorChoice = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    return response
  }

  const playMinor = (session: GameSession, cardId = CARD_ID) => {
    let response = enterMinorChoice(session)
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) =>
      option.value === cardId || option.value === `minor:${cardId}`)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  const bonusScore = (response: SessionResponse) => response.scores[0]!.categories
    .find((category) => category.key === 'cardBonusVp')?.entries
    .find((entry) => 'cardId' in entry && entry.cardId === CARD_ID)?.score ?? 0

  const addSheepPasture = (session: GameSession, capacityFour = false, sheep = 0) => {
    const state = session.getState().state
    const owner = state.players[0]!
    owner.pastures = [{
      id: 'sheep-pasture', size: 1, tiles: [{ row: 0, col: 2 }],
      stables: capacityFour ? 1 : 0, animalType: sheep > 0 ? 'sheep' : null, animalCount: sheep,
    }]
    owner.stableTiles = capacityFour ? [{ row: 0, col: 2 }] : []
    owner.resources.sheep = sheep
    session.loadState(state)
  }

  const collectMarketSheep = (session: GameSession, sheep: number) => {
    addSheepPasture(session, sheep > 2)
    const state = session.getState().state
    const market = state.actionSpaces.find((space) => space.id === 'sheep-market')
    if (!market) throw new Error('sheep-market missing')
    market.resources.sheep = sheep
    session.loadState(state)

    let response = session.takeAction(0, 'sheep-market')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    response = session.resolveChoice(0, 'confirm', [
      { id: 'sheep-pasture', zoneType: 'pasture', animalType: 'sheep', animalCount: sheep },
    ])
    expect(response.ok, response.error).toBe(true)
    return response
  }

  it('D036 S1: with no sheep Breed Registry is played for free', () => {
    const response = playMinor(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('D036 S3: gaining no non-breeding sheep grants three bonus points', () => {
    const response = setup({ played: true }).getState()

    expect(bonusScore(response)).toBe(3)
  })

  it('D036 S4: gaining two sheep from Sheep Market still grants three bonus points', () => {
    const response = collectMarketSheep(setup({ played: true }), 2)

    expect(response.state.players[0]!.resources.sheep).toBe(2)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.boardSheep).toBe(2)
    expect(bonusScore(response)).toBe(3)
  })

  it('D036 S5: gaining three sheep from Sheep Market grants no bonus points', () => {
    const response = collectMarketSheep(setup({ played: true }), 3)

    expect(response.state.players[0]!.resources.sheep).toBe(3)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.boardSheep).toBe(3)
    expect(bonusScore(response)).toBe(0)
  })

  it('D036 S6: a sheep born during breeding does not count toward the two-sheep limit', () => {
    const session = setup({ played: true, round: 4, harvest: true })
    addSheepPasture(session, true, 2)

    let response = session.performRoundEnd()
    for (let guard = 0; guard < 20
      && response.interaction.stateId === 'wait'
      && response.interaction.request.kind !== 'animal-reorg'; guard += 1) {
      response = response.interaction.request.kind === 'feed'
        ? session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
        : session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    response = session.resolveChoice(0, 'confirm', [
      { id: 'sheep-pasture', zoneType: 'pasture', animalType: 'sheep', animalCount: 3 },
    ])
    response = autoAdvanceRoundEnd(session, { initialResponse: response })

    expect(response.state.players[0]!.resources.sheep).toBe(3)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.boardSheep ?? 0).toBe(0)
    expect(bonusScore(response)).toBe(3)
  })

  it('D036 S7: a sheep gained from a card counts toward the two-sheep limit', () => {
    const session = setup({ played: true })
    const state = session.getState().state
    state.players[0]!.minorHand = [FEED_PELLETS]
    session.loadState(state)

    let response = playMinor(session, FEED_PELLETS)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      response = session.resolveChoice(0, 'confirm', [
        { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      ])
    }

    expect(response.state.players[0]!.resources.sheep).toBe(1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.cardSheep).toBe(1)
    expect(bonusScore(response)).toBe(3)
  })

  it('D036 S8: turning a gained sheep into food removes the bonus', () => {
    const session = setup({ played: true, fireplace: true })
    const state = session.getState().state
    const market = state.actionSpaces.find((space) => space.id === 'sheep-market')
    if (!market) throw new Error('sheep-market missing')
    market.resources.sheep = 1
    session.loadState(state)

    let response = session.takeAction(0, 'sheep-market')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    expect(response.interaction.anytimeActions.map((action) => action.id)).toContain('exchange')
    response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    response = session.resolveChoice(0, 'bulk:0=1')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, food: 22 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.sheepConvertedToFood).toBe(true)
    expect(bonusScore(response)).toBe(0)
  })
})
