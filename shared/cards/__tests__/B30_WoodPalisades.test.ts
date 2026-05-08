import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState } from '../../contract/types'

import '../B/B30_WoodPalisades'
import { B30_WoodPalisades } from '../B/B30_WoodPalisades'

const CARD_ID = 'B30_WoodPalisades'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as unknown as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, roundPhase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('B30_WoodPalisades', () => {
  it('costs 1 food', () => {
    expect(B30_WoodPalisades.cost).toEqual({ food: 1 })
  })

  it('awards 1 VP per palisade segment when card is played', () => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.fenceSegments = [
      { edge: 'H-0-0', type: 'palisade' },
      { edge: 'H-1-0', type: 'palisade' },
      { edge: 'V-0-0', type: 'fence' },
    ]
    const state = createState(player)
    const effect = getCardEffect(CARD_ID)!
    const score = effect.computeBonusScore!(state, player, { reserved: {} })
    expect(score).toBe(2)
  })

})
