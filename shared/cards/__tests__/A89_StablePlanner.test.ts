import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState } from '../../game/types'

import '../A/A89_StablePlanner'

const CARD_ID = 'A89_StablePlanner'

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

describe('A89_StablePlanner', () => {
  it('onBuy queues future meeples at +3, +6, +9', () => {
    const player = createPlayer()
    const state = createState(player)
    state.round = 2
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    expect(state.pendingFutureMeeples.length).toBe(1)
    const req = state.pendingFutureMeeples[0]!
    if ('entries' in req) {
      expect(req.entries.map((e) => e.round)).toEqual([5, 8, 11])
    }
  })

  it('clamps future meeples to round 14', () => {
    const player = createPlayer()
    const state = createState(player)
    state.round = 10
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    const req = state.pendingFutureMeeples[0]!
    if ('entries' in req) {
      // rounds 13, 16, 19 → only 13 stays (others filtered)
      expect(req.entries.map((e) => e.round)).toEqual([13])
    }
  })

  it('onRoundStart offers free stable at target round', () => {
    const player = createPlayer()
    const state = createState(player)
    state.round = 2
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    state.round = 5
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeTruthy()
    expect((flow as { type: string }).type).toBe('seq')
  })

  it('onRoundStart returns nothing on non-target round', () => {
    const player = createPlayer()
    const state = createState(player)
    state.round = 2
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    state.round = 4
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeFalsy()
  })
})
