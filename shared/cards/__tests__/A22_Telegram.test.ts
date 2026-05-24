import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState } from '../../contract/types'
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
  it('computes target round from fence reserve, excluding palisades and E74-held fences', () => {
    const player = createPlayer()
    setFencesForTest(player, 4)
    setPalisadesForTest(player, 3)
    player.cardStates = { E74_AshTrees: { counters: { fences: 5 } } }
    player.supplyTokensConsumed = { fence: 1 }
    const state = createState(player)
    const effect = getCardEffect(CARD_ID)!

    effect.onBuy!(state, player)

    expect(player.cardStates?.[CARD_ID]?.extraData?.triggerRound).toBe(8)
  })

  it('does not mark a target round when the reserve target would exceed round 14', () => {
    const player = createPlayer()
    setPalisadesForTest(player, 5)
    const state = createState(player)
    const effect = getCardEffect(CARD_ID)!

    effect.onBuy!(state, player)

    expect(player.cardStates?.[CARD_ID]?.extraData?.triggerRound).toBeUndefined()
  })
})

describe('A22_Telegram onBeforeStartOfTurn', () => {
  const setupTriggerable = () => {
    const player = createPlayer() as PlayerState & { workers?: { id: string; isActive: boolean; isNewborn: boolean }[] }
    player.workers = [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
    ]
    player.cardStates = { [CARD_ID]: { extraData: { triggerRound: 5 } } }
    const state = createState(player as PlayerState)
    state.round = 5
    return { player: player as PlayerState, state }
  }

  it('fires when reserve has at least 1 worker (no actionSpaces taking workers)', () => {
    const { player, state } = setupTriggerable()
    const effect = getCardEffect(CARD_ID)!
    const flow = effect.onBeforeStartOfTurn!(state, player)
    expect(flow).toBeTruthy()
    expect(flow!.type).toBe('seq')
  })

  it('does NOT fire when all workers are placed (workersAvailable === 0)', () => {
    const { player, state } = setupTriggerable()
    state.actionSpaces = [
      { id: 'a', takenBy: [{ playerId: 'p1', workerId: '1' }] },
      { id: 'b', takenBy: [{ playerId: 'p1', workerId: '2' }] },
    ] as unknown as GameState['actionSpaces']
    const effect = getCardEffect(CARD_ID)!
    const flow = effect.onBeforeStartOfTurn!(state, player)
    expect(flow).toBeFalsy()
  })

  it('does NOT fire when current round != triggerRound', () => {
    const { player, state } = setupTriggerable()
    state.round = 7
    const effect = getCardEffect(CARD_ID)!
    const flow = effect.onBeforeStartOfTurn!(state, player)
    expect(flow).toBeFalsy()
  })

  it('does NOT fire twice (once-per-game flag prevents repeat)', () => {
    const { player, state } = setupTriggerable()
    const effect = getCardEffect(CARD_ID)!
    const first = effect.onBeforeStartOfTurn!(state, player)
    expect(first).toBeTruthy()
    const second = effect.onBeforeStartOfTurn!(state, player)
    expect(second).toBeFalsy()
  })
})
