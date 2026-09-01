import { describe, expect, it } from 'vitest'
import { C109_SchnappsDistiller } from '../../shared/cards/C/C109_SchnappsDistiller'
import { getExchangesInWindow } from '../../shared/actions/effects/exchange'
import type { PlayerState, Resource } from '../../shared/contract/types'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

const CARD_ID = 'C109_SchnappsDistiller'

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: {
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
    vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
  } as Resource,
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
  ...overrides,
})

const setupHarvestSession = () => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 4
  state.roundPhase = 'work'
  for (const player of state.players) {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 0)
    player.resources.food = 0
  }
  const distiller = state.players[0]!
  setActiveWorkerCount(distiller, 1)
  distiller.occupationPlayed.push(CARD_ID)
  distiller.resources.vegetable = 2
  session.loadState(state)
  return session
}

describe('C109_SchnappsDistiller — metadata exchange', () => {
  it('executes the harvest exchange through GameSession and caps a submitted count of 2 at 1', () => {
    const session = setupHarvestSession()
    let response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected harvest feed')
    expect(response.interaction).toMatchObject({
      playerIndex: 0,
      request: {
        kind: 'feed',
        remaining: 2,
        foodUsed: 0,
        maxTradeTimesBySourceId: { [CARD_ID]: 1 },
      },
    })
    expect(response.scores).toHaveLength(2)

    response = session.resolveChoice(0, 'confirm', {
      selections: [{
        sourceId: CARD_ID,
        exchangeIndex: 0,
        count: 2,
        sourceName: 'Schnapps Distiller',
      }],
    })

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      vegetable: 1,
      food: 3,
      begging: 0,
    })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.harvestExchangeUsage)
      .toEqual({ round: 4, count: 1 })
    expect(response.state).toMatchObject({ round: 5, roundPhase: 'work' })
    expect(response.interaction.stateId).toBe('idle')
    expect(response.scores).toHaveLength(2)

    const convertedEvents = response.state.events.filter((event) => event.type === 'harvest.feedConverted')
    const feedingEvents = response.state.events.filter((event) =>
      event.type === 'resource.paid' && event.paymentFor === 'feeding',
    )
    expect(convertedEvents).toEqual([
      expect.objectContaining({
        playerId: response.state.players[0]!.id,
        source: 'Schnapps Distiller',
        cost: { vegetable: 1 },
        food: { food: 5 },
      }),
    ])
    expect(feedingEvents).toEqual([
      expect.objectContaining({ resources: expect.objectContaining({ food: 2 }) }),
    ])
    expect(convertedEvents[0]!.seq).toBeLessThan(feedingEvents[0]!.seq)
    expect(response.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'log.harvestFeedConvert',
        params: expect.objectContaining({ cost: { vegetable: 1 }, food: { food: 5 } }),
      }),
      expect.objectContaining({
        key: 'log.harvestFeedDetail',
        params: expect.objectContaining({ resources: expect.objectContaining({ food: 2 }) }),
      }),
    ]))
  })

  it('declines the optional harvest exchange and leaves the vegetable for normal feeding', () => {
    const session = setupHarvestSession()
    let response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected harvest feed')

    response = session.resolveChoice(0, 'confirm', { selections: [] })

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      vegetable: 2,
      food: 0,
      begging: 2,
    })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.harvestExchangeUsage)
      .toBeUndefined()
    expect(response.state.events.some((event) => event.type === 'harvest.feedConverted')).toBe(false)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.paid',
      paymentFor: 'feeding',
      resources: expect.objectContaining({ begging: 2 }),
    }))
    expect(response.state.log.some((entry) => entry.key === 'log.harvestFeedConvert')).toBe(false)
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.harvestFeedDetail',
      params: expect.objectContaining({ resources: expect.objectContaining({ begging: 2 }) }),
    }))
    expect(response.state).toMatchObject({ round: 5, roundPhase: 'work' })
    expect(response.interaction.stateId).toBe('idle')
    expect(response.scores).toHaveLength(2)
  })

  it('does not offer or execute the exchange during a work-phase action', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 2
    state.roundPhase = 'work'
    state.players[0]!.occupationPlayed.push(CARD_ID)
    state.players[0]!.resources.vegetable = 1
    state.players[0]!.resources.food = 0
    session.loadState(state)

    const response = session.takeAction(0, 'farmland')

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, food: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.harvestExchangeUsage)
      .toBeUndefined()
    expect(response.state.events.some((event) => event.type === 'harvest.feedConverted')).toBe(false)
    expect(response.state.log.some((entry) => entry.key === 'log.harvestFeedConvert')).toBe(false)
    expect(response.interaction.anytimeActions.some((action) => action.sourceCard === CARD_ID)).toBe(false)
    expect(response.scores).toHaveLength(2)
  })

  it('declares a single harvest exchange (1 vegetable -> 5 food, max:1)', () => {
    const exchanges = C109_SchnappsDistiller.exchanges ?? []
    expect(exchanges).toHaveLength(1)
    const ex = exchanges[0]!
    expect(ex.from.vegetable).toBe(1)
    expect(ex.to.food).toBe(5)
    expect(ex.max).toBe(1)
    expect(ex.sourceId).toBe(CARD_ID)
    expect(ex.triggers).toEqual(['harvest'])
  })

  it('appears in harvest window for player who played it', () => {
    const player = makePlayer({ occupationPlayed: [CARD_ID] })
    const trades = getExchangesInWindow(player, 'harvest')
    expect(trades).toHaveLength(1)
    expect(trades[0]!.from.vegetable).toBe(1)
    expect(trades[0]!.to.food).toBe(5)
    expect(trades[0]!.sourceId).toBe(CARD_ID)
  })

  it('not visible in anytime window (harvest-only)', () => {
    const player = makePlayer({ occupationPlayed: [CARD_ID] })
    const trades = getExchangesInWindow(player, 'anytime')
    expect(trades).toHaveLength(0)
  })
})
