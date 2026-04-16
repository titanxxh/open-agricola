import { describe, expect, it } from 'vitest'
import { getCardEffect, runCardEffectHook } from '../card-effects'
import type { GameState, PlayerState } from '../../game/types'

import '../D/D18_SteamPlow'
import { D18_SteamPlow as D18Card } from '../D/D18_SteamPlow'

const CARD_ID = 'D18_SteamPlow'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: [], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
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

describe('D18_SteamPlow', () => {
  it('card definition has correct properties', () => {
    expect(D18Card.cost).toEqual({ wood: 1, food: 1 })
    expect(D18Card.vp).toBe(1)
    expect(D18Card.newSet).toBe(true)
  })

  it('onStartReturnHome returns optional pay+plow+sow flow when player can afford', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).not.toBeNull()
    const player = createPlayer()
    player.resources.wood = 5
    player.resources.food = 3
    const state = createState(player)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).not.toBeNull()
    const seq = flow as any
    expect(seq.type).toBe('seq')
    expect(seq.optional).toBe(true)
    expect(seq.children).toHaveLength(3)
    // First child: pay 2 wood + 1 food
    expect(seq.children[0].actionId).toBe('pay-resources')
    expect(seq.children[0].params).toEqual({ wood: 2, food: 1 })
    expect(seq.children[0].sourceCard).toBe(CARD_ID)
    // Second child: plow
    expect(seq.children[1].actionId).toBe('plow')
    expect(seq.children[1].sourceCard).toBe(CARD_ID)
    // Third child: optional sow
    expect(seq.children[2].actionId).toBe('sow')
    expect(seq.children[2].sourceCard).toBe(CARD_ID)
    expect(seq.children[2].optional).toBe(true)
    expect(seq.children[2].actionContext).toEqual({ trueAction: false })
  })

  it('onStartReturnHome returns nothing when player cannot afford wood', () => {
    const player = createPlayer()
    player.resources.wood = 1
    player.resources.food = 3
    const state = createState(player)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeNull()
  })

  it('onStartReturnHome returns nothing when player cannot afford food', () => {
    const player = createPlayer()
    player.resources.wood = 5
    player.resources.food = 0
    const state = createState(player)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeNull()
  })

  it('onStartReturnHome returns nothing when card is not played', () => {
    const player = createPlayer()
    player.minorPlayed = []
    player.resources.wood = 5
    player.resources.food = 3
    const state = createState(player)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeNull()
  })

  it('onStartReturnHome triggers at exact resource threshold (2 wood, 1 food)', () => {
    const player = createPlayer()
    player.resources.wood = 2
    player.resources.food = 1
    const state = createState(player)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).not.toBeNull()
  })
})
