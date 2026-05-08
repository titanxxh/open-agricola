import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { GameState, PlayerState, Resource } from '../../shared/contract/types'

import '../../shared/cards/E/E127_DiligentFarmer'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'E127_DiligentFarmer'

const emptyResources = (): Resource => ({
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
})

describe('E127_DiligentFarmer session', () => {
  it('onBuy offers free room when player has 3+ scoring categories at 4 points', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    // Set up to score 4 in fields (5+ fields), pastures (4+ pastures), grains (8+ grain)
    player.fields = [
      { row: 1, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 1, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 1, col: 2, stacks: [] },
      { row: 1, col: 3, stacks: [] },
      { row: 1, col: 4, stacks: [] },
    ]
    // 5 fields = 4 points

    player.resources.grain = 6
    // 6 grain + 2 on fields = 8 grain = 4 points

    player.pastures = [
      { id: 'p1', size: 1, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: null, animalCount: 0 },
      { id: 'p2', size: 1, tiles: [{ row: 2, col: 1 }], stables: 0, animalType: null, animalCount: 0 },
      { id: 'p3', size: 1, tiles: [{ row: 2, col: 2 }], stables: 0, animalType: null, animalCount: 0 },
      { id: 'p4', size: 1, tiles: [{ row: 2, col: 3 }], stables: 0, animalType: null, animalCount: 0 },
    ]
    // 4 pastures = 4 points

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
    expect((flow as Extract<ActionFlow, { type: 'seq' }>).children[0].actionId).toBe('build-farmhand-room')
  })

  it('onBuy returns undefined when player has fewer than 3 categories at max score', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    // Only 1 category at max: fields = 5 → 4 points
    player.fields = [
      { row: 1, col: 0, stacks: [] },
      { row: 1, col: 1, stacks: [] },
      { row: 1, col: 2, stacks: [] },
      { row: 1, col: 3, stacks: [] },
      { row: 1, col: 4, stacks: [] },
    ]
    // 5 fields = 4 points, but only 1 category

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onBuy returns undefined with no max score categories at all', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })
})
