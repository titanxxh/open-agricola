import { describe, expect, it } from 'vitest'
import { getCardEffect, runCardEffectHook } from '../card-effects'
import type { GameState, PlayerState } from '../../game/types'

import '../D/D69_SmallGreenhouse'

const CARD_ID = 'D69_SmallGreenhouse'

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
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: ['Occ1'],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
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

describe('D69_SmallGreenhouse', () => {
  it('onBuy queues future meeples for rounds current+4 and current+7', () => {
    const player = createPlayer()
    const state = createState(player)
    state.round = 3
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect(state.pendingFutureMeeples).toHaveLength(1)
    const request = state.pendingFutureMeeples[0] as any
    expect(request.cardId).toBe(CARD_ID)
    expect(request.entries).toHaveLength(2)
    expect(request.entries[0].round).toBe(7)
    expect(request.entries[0].resources).toEqual({ vegetable: 1 })
    expect(request.entries[1].round).toBe(10)
    expect(request.entries[1].resources).toEqual({ vegetable: 1 })
  })

  it('onBuy filters out rounds > 14', () => {
    const player = createPlayer()
    const state = createState(player)
    state.round = 11
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
    expect(state.pendingFutureMeeples).toHaveLength(0)
  })

  it('onRoundStart offers pay 1 food for 1 vegetable on target round', () => {
    const player = createPlayer()
    player.resources.food = 2
    player.cardStates = {
      [CARD_ID]: { extraData: { targetRounds: [7, 10] } },
    }
    const state = createState(player)
    state.round = 7

    const flow = runCardEffectHook(state, player, CARD_ID, 'onRoundStart')
    expect(flow).not.toBeNull()
    const seq = flow as any
    expect(seq.type).toBe('seq')
    expect(seq.optional).toBe(true)
    const payLeaf = seq.children.find((c: any) => c.actionId === 'pay-resources')
    expect(payLeaf).toBeDefined()
    expect(payLeaf.params).toEqual({ food: 1 })
    const gainLeaf = seq.children.find((c: any) => c.actionId === 'gain')
    expect(gainLeaf).toBeDefined()
    expect(gainLeaf.params).toEqual({ vegetable: 1 })
  })

  it('onRoundStart returns nothing on non-target round', () => {
    const player = createPlayer()
    player.resources.food = 2
    player.cardStates = {
      [CARD_ID]: { extraData: { targetRounds: [7, 10] } },
    }
    const state = createState(player)
    state.round = 5

    const flow = runCardEffectHook(state, player, CARD_ID, 'onRoundStart')
    expect(flow).toBeNull()
  })

  it('onRoundStart returns nothing when player has no food', () => {
    const player = createPlayer()
    player.resources.food = 0
    player.cardStates = {
      [CARD_ID]: { extraData: { targetRounds: [7, 10] } },
    }
    const state = createState(player)
    state.round = 7

    const flow = runCardEffectHook(state, player, CARD_ID, 'onRoundStart')
    expect(flow).toBeNull()
  })
})
