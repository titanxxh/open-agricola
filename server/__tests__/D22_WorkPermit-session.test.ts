import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { GameState, PlayerState } from '../../shared/contract/types'

import { D22_WorkPermit } from '../../shared/cards/D/D22_WorkPermit'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { GameSession } from '../game/authoritative-session'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'D22_WorkPermit'

const createPlayer = (
  id = 'p1',
  resources: Partial<Record<string, number>> = {},
): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      ...resources,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood' as const,
    fields: [], fences: 0, roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as unknown as PlayerState

const createState = (round: number, players: PlayerState[]): GameState =>
  ({
    round, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('D22_WorkPermit card effect', () => {
  it('onBuy queues a future-meeple at current + building resources', () => {
    const player = createPlayer('p1', { wood: 1, clay: 2, stone: 0, reed: 1, food: 1 })
    const state = createState(3, [player])
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect(state.pendingFutureMeeples.length).toBe(1)
    const req = state.pendingFutureMeeples[0]!
    if ('entries' in req) {
      // 3 + 1 + 2 + 0 + 1 = 7
      expect(req.entries.map((e) => e.round)).toEqual([7])
    }
  })

  it('onBuy clamps target round to 14', () => {
    const player = createPlayer('p1', { wood: 5, clay: 5, stone: 5, reed: 5, food: 1 })
    const state = createState(10, [player])
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    const req = state.pendingFutureMeeples[0]!
    if ('entries' in req) {
      expect(req.entries[0]!.round).toBe(14)
    }
  })

  it('onBuy does nothing when the player has 0 building resources', () => {
    const player = createPlayer('p1', { wood: 0, clay: 0, stone: 0, reed: 0, food: 5 })
    const state = createState(3, [player])
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
    expect(state.pendingFutureMeeples.length).toBe(0)
  })

  it('onRoundStart offers an optional place-farmer at target round', () => {
    const player = createPlayer('p1', { wood: 1, clay: 1, stone: 0, reed: 0, food: 1 })
    player.minorPlayed.push(CARD_ID)
    const state = createState(3, [player])
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    // target round = 3 + 2 = 5
    state.round = 5
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeDefined()
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
    expect((flow as Extract<ActionFlow, { type: 'seq' }>).children[0].actionId).toBe('place-farmer')
    expect((flow as Extract<ActionFlow, { type: 'seq' }>).children[0].sourceCard).toBe(CARD_ID)
  })

  it('onRoundStart does nothing when not at target round', () => {
    const player = createPlayer('p1', { wood: 1 })
    player.minorPlayed.push(CARD_ID)
    const state = createState(3, [player])
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    state.round = 5
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onRoundStart fires only once per round (flag guard)', () => {
    const player = createPlayer('p1', { wood: 1 })
    player.minorPlayed.push(CARD_ID)
    const state = createState(3, [player])
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    state.round = 4 // 3 + 1
    const first = effect!.onRoundStart!(state, player)
    expect(first).toBeDefined()
    const second = effect!.onRoundStart!(state, player)
    expect(second).toBeUndefined()
  })

  describe('prerequisite "At Least 1 Building Resource"', () => {
    it('blocks when player has no building resources', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      player.resources.wood = 0
      player.resources.stone = 0
      player.resources.clay = 0
      player.resources.reed = 0
      expect(meetsCardPrerequisites(player, D22_WorkPermit, state.round, state)).toBe(false)
    })

    it('blocks when no worker is available even with resources', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      player.resources.wood = 1
      // Place all workers on action spaces
      const space = state.actionSpaces[0]!
      space.takenBy = player.workers.map((w) => ({ playerId: player.id, workerId: w.id }))
      expect(meetsCardPrerequisites(player, D22_WorkPermit, state.round, state)).toBe(false)
    })

    it('allows when player has at least 1 resource and a worker in reserve', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      player.resources.wood = 1
      expect(meetsCardPrerequisites(player, D22_WorkPermit, state.round, state)).toBe(true)
    })
  })
})
