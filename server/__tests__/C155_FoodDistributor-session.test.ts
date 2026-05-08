import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { GameState, PlayerState, ActionSpace } from '../../shared/contract/types'

import '../../shared/cards/C/C155_FoodDistributor'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'C155_FoodDistributor'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
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
  }) as PlayerState

const createSpace = (id: string, roundAvailable = 1): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const createState = (player: PlayerState, occupiedSpaces: number): GameState => {
  const spaces: ActionSpace[] = []
  for (let i = 0; i < 14; i++) {
    const space = createSpace(`space-${i}`, i + 1)
    if (i < occupiedSpaces) {
      space.takenBy = [{ playerId: 'p1', workerId: '1' }]
    }
    spaces.push(space)
  }
  return {
    round: 3, currentPlayerIndex: 0, players: [player],
    actionSpaces: spaces, log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  } as GameState
}

describe('C155_FoodDistributor', () => {
  it('onBuy gives 1 grain and records purchase round', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()

    const player = createPlayer()
    const state = createState(player, 0)
    state.round = 5

    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ grain: 1 })

    // Check purchase round was recorded
    expect(player.cardStates?.[CARD_ID]?.extraData?.purchaseRound).toBe(5)
  })

  it('onStartReturnHome gives food = occupied round spaces on purchase round', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()

    const player = createPlayer()
    // Simulate purchase on round 3
    player.cardStates = {
      [CARD_ID]: { extraData: { purchaseRound: 3 } },
    }
    const state = createState(player, 5)
    state.round = 3

    const flow = effect!.onStartReturnHome!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ food: 5 })
  })

  it('onStartReturnHome does not fire on different round', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()

    const player = createPlayer()
    player.cardStates = {
      [CARD_ID]: { extraData: { purchaseRound: 3 } },
    }
    const state = createState(player, 5)
    state.round = 4  // Different round

    const flow = effect!.onStartReturnHome!(state, player)
    // Should not return a gain flow (just flags the card)
    expect(flow).toBeUndefined()
  })

  it('onStartReturnHome does not fire after being flagged', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()

    const player = createPlayer()
    player.cardStates = {
      [CARD_ID]: { flagged: true, extraData: { purchaseRound: 3 } },
    }
    const state = createState(player, 5)
    state.round = 3

    const flow = effect!.onStartReturnHome!(state, player)
    expect(flow).toBeUndefined()
  })
})
