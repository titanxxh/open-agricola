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
    expect(response.interaction.request.kind).toBe('feed')

    response = session.resolveChoice(0, 'confirm', {
      selections: [{ sourceId: CARD_ID, exchangeIndex: 0, count: 2 }],
    })

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      vegetable: 1,
      food: 5,
      begging: 0,
    })
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.harvestFeedConvert',
      params: expect.objectContaining({ cost: { vegetable: 1 }, food: { food: 5 } }),
    }))
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
    expect(response.interaction.anytimeActions.some((action) => action.sourceCard === CARD_ID)).toBe(false)
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
