import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState } from '../../game/types'
import { setFencesForTest, setPalisadesForTest } from './__fixtures__/fence'

import '../B/B119_Lumberjack'

const CARD_ID = 'B119_Lumberjack'

const createPlayer = (): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [CARD_ID], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    cardStates: {},
  }) as unknown as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, phase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('B119_Lumberjack', () => {
  it('queues future wood meeples only for fence segments (palisades excluded)', () => {
    const player = createPlayer()
    setFencesForTest(player, 3)
    setPalisadesForTest(player, 2)
    const state = createState(player)
    const effect = getCardEffect(CARD_ID)!

    const result = effect.onBuy!(state, player)

    // result is a seq with gain(wood: 1) + queueFutureMeeplesFlow(count=3)
    expect(result?.type).toBe('seq')
    if (result?.type !== 'seq') return
    // Immediate +1 wood leaf is first child; queue flow only present when fences > 0.
    expect(result.children.length).toBe(2)
  })

  it('skips future meeples when only palisades are built', () => {
    const player = createPlayer()
    setPalisadesForTest(player, 4)
    const state = createState(player)
    const effect = getCardEffect(CARD_ID)!

    const result = effect.onBuy!(state, player)

    expect(result?.type).toBe('seq')
    if (result?.type !== 'seq') return
    expect(result.children.length).toBe(1)
  })
})
