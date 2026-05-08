import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B50_ButterChurn'
import type { ActionFlow } from '../../shared/contract/types'

describe('B50_ButterChurn — onHarvestFieldPhase uses on-board sheep+cattle (not reserve)', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push('B50_ButterChurn')
    return session
  }

  it('reserve only animals: no food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.sheep = 6
    player.resources.cattle = 4
    const flow = runCardEffectHook(state, player, 'B50_ButterChurn', 'onHarvestFieldPhase')
    expect(flow).toBeNull()
  })

  it('3 sheep on board: +1 food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 2, tiles: [], stables: 0, animalType: 'sheep', animalCount: 3 },
    ]
    player.resources.sheep = 3
    const flow = runCardEffectHook(state, player, 'B50_ButterChurn', 'onHarvestFieldPhase')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ food: 1 })
  })

  it('2 cattle on board: +1 food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 2, tiles: [], stables: 0, animalType: 'cattle', animalCount: 2 },
    ]
    player.resources.cattle = 2
    const flow = runCardEffectHook(state, player, 'B50_ButterChurn', 'onHarvestFieldPhase')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 1 })
  })

  it('6 sheep + 4 cattle on board: 2 + 2 = 4 food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 3, tiles: [], stables: 0, animalType: 'sheep', animalCount: 6 },
      { id: 'pa-2', size: 2, tiles: [], stables: 0, animalType: 'cattle', animalCount: 4 },
    ]
    player.resources.sheep = 6
    player.resources.cattle = 4
    const flow = runCardEffectHook(state, player, 'B50_ButterChurn', 'onHarvestFieldPhase')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 4 })
  })

  it('mixed (placed 3 sheep + reserve 5 sheep): +1 food (placed only)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 1, tiles: [], stables: 0, animalType: 'sheep', animalCount: 3 },
    ]
    player.resources.sheep = 8
    const flow = runCardEffectHook(state, player, 'B50_ButterChurn', 'onHarvestFieldPhase')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 1 })
  })
})
