import { describe, expect, it } from 'vitest'
import { getCardEffect, runCardEffectHook } from '../card-effects'
import type { GameState, PlayerState } from '../../game/types'

import '../D/D91_Plowman'

const CARD_ID = 'D91_Plowman'

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
    round: 2, phase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('D91_Plowman', () => {
  it('onBuy queues future meeples for rounds current+4, +7, +10', () => {
    const player = createPlayer()
    const state = createState(player)
    state.round = 2
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect(state.pendingFutureMeeples).toHaveLength(1)
    const request = state.pendingFutureMeeples[0] as any
    expect(request.cardId).toBe(CARD_ID)
    expect(request.entries).toHaveLength(3)
    expect(request.entries[0].round).toBe(6)
    expect(request.entries[1].round).toBe(9)
    expect(request.entries[2].round).toBe(12)
  })

  it('onBuy stores target rounds in extraData', () => {
    const player = createPlayer()
    const state = createState(player)
    state.round = 2
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    const targetRounds = player.cardStates?.[CARD_ID]?.extraData?.targetRounds
    expect(targetRounds).toEqual([6, 9, 12])
  })

  it('onRoundStart offers pay 1 food + plow on target round', () => {
    const player = createPlayer()
    player.resources.food = 3
    player.cardStates = {
      [CARD_ID]: { extraData: { targetRounds: [6, 9, 12] } },
    }
    const state = createState(player)
    state.round = 6

    const flow = runCardEffectHook(state, player, CARD_ID, 'onRoundStart')
    expect(flow).not.toBeNull()
    const seq = flow as any
    expect(seq.type).toBe('seq')
    expect(seq.optional).toBe(true)
    expect(seq.children).toHaveLength(2)
    expect(seq.children[0].actionId).toBe('pay-resources')
    expect(seq.children[0].params).toEqual({ food: 1 })
    expect(seq.children[1].actionId).toBe('plow')
  })

  it('onRoundStart returns nothing on non-target round', () => {
    const player = createPlayer()
    player.resources.food = 3
    player.cardStates = {
      [CARD_ID]: { extraData: { targetRounds: [6, 9, 12] } },
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
      [CARD_ID]: { extraData: { targetRounds: [6, 9, 12] } },
    }
    const state = createState(player)
    state.round = 6

    const flow = runCardEffectHook(state, player, CARD_ID, 'onRoundStart')
    expect(flow).toBeNull()
  })
})
