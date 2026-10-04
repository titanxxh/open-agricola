import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../contract/types'

import '../B/B036_Bottles'
import { B036_Bottles as B36Card } from '../../cards/B/B036_Bottles'

import { setActiveWorkerCount } from '../../domain/player'
const CARD_ID = 'B036_Bottles'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as unknown as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, roundPhase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [], log: [],
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('B036_Bottles', () => {
  it('card definition has 4 VP and empty base cost', () => {
    expect(B36Card.vp).toBe(4)
    expect(B36Card.cost).toEqual({})
  })

  it('getBaseCosts sets cost based on family size (2 farmers)', () => {
    const player = createPlayer()
    setActiveWorkerCount(player, 2)
    const state = createState(player)

    expect(B36Card.impl.getBaseCosts?.({
      state,
      player,
      cardId: CARD_ID,
      actionId: 'improvement',
    })).toEqual([{ clay: 2, food: 2 }])
  })

  it('getBaseCosts scales with 3 farmers', () => {
    const player = createPlayer()
    setActiveWorkerCount(player, 3)
    const state = createState(player)

    expect(B36Card.impl.getBaseCosts?.({
      state,
      player,
      cardId: CARD_ID,
      actionId: 'improvement',
    })).toEqual([{ clay: 3, food: 3 }])
  })

  it('getBaseCosts scales with 5 farmers', () => {
    const player = createPlayer()
    setActiveWorkerCount(player, 5)
    const state = createState(player)

    expect(B36Card.impl.getBaseCosts?.({
      state,
      player,
      cardId: CARD_ID,
      actionId: 'improvement',
    })).toEqual([{ clay: 5, food: 5 }])
  })
})
