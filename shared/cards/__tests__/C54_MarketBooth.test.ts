import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState } from '../../contract/types'
import { setFencesForTest, setPalisadesForTest } from './__fixtures__/fence'

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
  it('does not trigger when player has only palisades (no fences)', () => {
    const player = createPlayer()
    setPalisadesForTest(player, 4)
    const effect = getCardEffect(CARD_ID)!

    const result = effect.onEndHarvestFieldPhase!(createState(player), player)

    expect(result).toBeUndefined()
  })

  it('triggers when player has at least one fence', () => {
    const player = createPlayer()
    setFencesForTest(player, 1)
    setPalisadesForTest(player, 3)
    const effect = getCardEffect(CARD_ID)!

    const result = effect.onEndHarvestFieldPhase!(createState(player), player)

    expect(result).toBeDefined()
    expect(result?.type).toBe('seq')
  })
})
