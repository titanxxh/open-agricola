import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState } from '../../contract/types'
import { C54_MarketBooth } from '../../cards/C/C54_MarketBooth'

import '../C/C54_MarketBooth'

const CARD_ID = 'C54_MarketBooth'

const createPlayer = (): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 2, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    cardStates: {},
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

describe('C54_MarketBooth', () => {
  it('prints a stable supply-token cost', () => {
    expect(C54_MarketBooth.cost).toEqual({ stable: 1 })
  })

  it('declares harvest exchange as grain + fence for 5 food', () => {
    const player = createPlayer()
    const effect = getCardEffect(CARD_ID)!

    const result = effect.onEndHarvestFieldPhase!(createState(player), player)

    expect(result).toBeDefined()
    expect(result?.type).toBe('seq')
    expect(result?.type === 'seq' ? result.optional : undefined).toBe(true)
    expect(result?.type === 'seq' ? result.children : undefined).toEqual([
      {
        type: 'leaf',
        actionId: 'pay',
        params: { grain: 1, fence: 1 },
        sourceCard: CARD_ID,
        choiceLabelKey: undefined,
        choiceLabelParams: undefined,
        effectPreview: undefined,
      },
      {
        type: 'leaf',
        actionId: 'gain',
        params: { food: 5 },
        sourceCard: CARD_ID,
        choiceLabelKey: undefined,
        choiceLabelParams: undefined,
      },
    ])
  })
})
