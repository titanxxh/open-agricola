import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState } from '../../game/types'

import '../A/A19_Handplow'

const CARD_ID = 'A19_Handplow'

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
    occupationHand: [], occupationPlayed: [], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
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

describe('A19_Handplow', () => {
  it('onBuy queues future meeple at round + 5', () => {
    const player = createPlayer()
    const state = createState(player)
    state.round = 3
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeTruthy()
    expect(state.pendingFutureMeeples.length).toBe(1)
    const req = state.pendingFutureMeeples[0]!
    expect('entries' in req).toBe(true)
    if ('entries' in req) {
      expect(req.entries[0]!.round).toBe(8)
    }
  })

  it('onRoundStart offers optional plow at target round', () => {
    const player = createPlayer()
    const state = createState(player)
    state.round = 3
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    state.round = 8
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeTruthy()
    expect((flow as { type: string }).type).toBe('seq')
  })

  it('onRoundStart returns nothing on non-target round', () => {
    const player = createPlayer()
    const state = createState(player)
    state.round = 3
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    state.round = 5
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeFalsy()
  })

  it('onRoundStart returns nothing if player does not have card', () => {
    const player = createPlayer()
    player.minorPlayed = []
    const state = createState(player)
    state.round = 8
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeFalsy()
  })
})
