import { describe, expect, it } from 'vitest'
import { getCardEffect, runCardEffectHook } from '../card-effects'
import type { GameState, PlayerState } from '../../game/types'

import { setActiveWorkerCount, setWorkersAtHome, workersAvailable, familySize } from '../../game/player'
import '../A/A127_Lodger'

const CARD_ID = 'A127_Lodger'

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
    occupationHand: [], occupationPlayed: [CARD_ID],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
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

describe('A127_Lodger', () => {
  it('onBuy sets hasRoom when round <= 9', () => {
    const effect = getCardEffect(CARD_ID)
    const player = createPlayer()
    const state = createState(player)
    state.round = 5
    effect!.onBuy!(state, player)
    expect(player.cardStates?.[CARD_ID]?.extraData?.hasRoom).toBe(true)
  })

  it('onBuy does not set hasRoom when round > 9', () => {
    const effect = getCardEffect(CARD_ID)
    const player = createPlayer()
    const state = createState(player)
    state.round = 10
    effect!.onBuy!(state, player)
    expect(player.cardStates?.[CARD_ID]?.extraData?.hasRoom).toBeUndefined()
  })

  it('computeExtraRoomCapacity returns 1 when hasRoom is true', () => {
    const effect = getCardEffect(CARD_ID)
    const player = createPlayer()
    player.cardStates = { [CARD_ID]: { extraData: { hasRoom: true } } }
    expect(effect!.computeExtraRoomCapacity!(player)).toBe(1)
  })

  it('computeExtraRoomCapacity returns 0 when hasRoom is false', () => {
    const effect = getCardEffect(CARD_ID)
    const player = createPlayer()
    expect(effect!.computeExtraRoomCapacity!(player)).toBe(0)
  })

  it('onStartReturnHome at round 9 removes a farmer when rooms < familySize', () => {
    const player = createPlayer()
    setActiveWorkerCount(player, 3)
    player.rooms = 2
    player.cardStates = { [CARD_ID]: { extraData: { hasRoom: true } } }
    const state = createState(player)
    setWorkersAtHome(state, player, 3)
    state.round = 9

    runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(familySize(player)).toBe(2)
    expect(workersAvailable(state, player)).toBe(2)
    expect(player.cardStates[CARD_ID]?.extraData?.hasRoom).toBe(false)
  })

  it('onStartReturnHome at round 9 does not remove farmer when rooms >= familySize', () => {
    const player = createPlayer()
    setActiveWorkerCount(player, 2)
    player.rooms = 3
    player.cardStates = { [CARD_ID]: { extraData: { hasRoom: true } } }
    const state = createState(player)
    setWorkersAtHome(state, player, 2)
    state.round = 9

    runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(familySize(player)).toBe(2)
    expect(workersAvailable(state, player)).toBe(2)
    expect(player.cardStates[CARD_ID]?.extraData?.hasRoom).toBe(false)
  })

  it('onStartReturnHome does nothing at round != 9', () => {
    const player = createPlayer()
    setActiveWorkerCount(player, 3)
    player.rooms = 2
    player.cardStates = { [CARD_ID]: { extraData: { hasRoom: true } } }
    const state = createState(player)
    state.round = 8

    runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(familySize(player)).toBe(3)
    expect(player.cardStates[CARD_ID]?.extraData?.hasRoom).toBe(true)
  })
})
