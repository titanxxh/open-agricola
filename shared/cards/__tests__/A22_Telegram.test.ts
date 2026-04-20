import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState } from '../../game/types'
import { setFencesForTest, setPalisadesForTest } from './__fixtures__/fence'

import '../A/A22_Telegram'

const CARD_ID = 'A22_Telegram'

const createPlayer = (): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
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

describe('A22_Telegram', () => {
  it('computes target round from fence count, excluding palisades', () => {
    const player = createPlayer()
    setFencesForTest(player, 4)
    setPalisadesForTest(player, 3)
    const state = createState(player)
    const effect = getCardEffect(CARD_ID)!

    effect.onBuy!(state, player)

    // round 3 + 4 fences = 7 (palisades ignored)
    expect(player.cardStates?.[CARD_ID]?.extraData?.triggerRound).toBe(7)
  })

  it('does not mark a target round when only palisades exist', () => {
    const player = createPlayer()
    setPalisadesForTest(player, 5)
    const state = createState(player)
    const effect = getCardEffect(CARD_ID)!

    effect.onBuy!(state, player)

    // 3 + 0 = 3 (current round). Still <= 14, so triggerRound = 3.
    expect(player.cardStates?.[CARD_ID]?.extraData?.triggerRound).toBe(3)
  })
})
