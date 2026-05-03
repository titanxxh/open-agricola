import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook, getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B39_Loom'
import type { ActionFlow } from '../../shared/game/types'

describe('B39_Loom — onHarvestFieldPhase uses on-board sheep (not reserve)', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push('B39_Loom')
    return session
  }

  it('reserve sheep only (no placed): no food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.sheep = 5 // all in reserve
    // pastures / house / stable empty
    const flow = runCardEffectHook(state, player, 'B39_Loom', 'onHarvestFieldPhase')
    expect(flow).toBeNull()
  })

  it('1 sheep on board (pasture): +1 food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 1, tiles: [], stables: 0, animalType: 'sheep', animalCount: 1 },
    ]
    player.resources.sheep = 1
    const flow = runCardEffectHook(state, player, 'B39_Loom', 'onHarvestFieldPhase')
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ food: 1 })
  })

  it('4 sheep on board: +2 food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 2, tiles: [], stables: 1, animalType: 'sheep', animalCount: 4 },
    ]
    player.resources.sheep = 4
    const flow = runCardEffectHook(state, player, 'B39_Loom', 'onHarvestFieldPhase')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 2 })
  })

  it('7 sheep on board (mixed sources): +3 food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 3, tiles: [], stables: 0, animalType: 'sheep', animalCount: 5 },
    ]
    player.houseAnimalType = 'sheep'
    player.houseAnimalCount = 1
    player.stableAnimals = { 's-1': 'sheep' }
    player.resources.sheep = 7
    const flow = runCardEffectHook(state, player, 'B39_Loom', 'onHarvestFieldPhase')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 3 })
  })

  it('mixed: 3 placed + 5 reserve → +1 food (only on-board counts)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 1, tiles: [], stables: 0, animalType: 'sheep', animalCount: 3 },
    ]
    player.resources.sheep = 8
    const flow = runCardEffectHook(state, player, 'B39_Loom', 'onHarvestFieldPhase')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 1 })
  })
})

describe('B39_Loom — computeBonusScore uses on-board sheep', () => {
  const score = (player: ReturnType<GameSession['getState']>['state']['players'][number]) => {
    const effect = getCardEffect('B39_Loom')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return effect!.computeBonusScore!(undefined as any, player, undefined as any)
  }

  it('reserve only 6 sheep: 0 VP', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.sheep = 6
    expect(score(player)).toBe(0)
  })

  it('6 sheep on board: 2 VP', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 3, tiles: [], stables: 0, animalType: 'sheep', animalCount: 6 },
    ]
    expect(score(player)).toBe(2)
  })
})
