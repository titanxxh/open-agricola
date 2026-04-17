import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import {
  executeCardListener,
  getRegisteredCardListeners,
} from '../../shared/cards/card-listeners'

import '../../shared/cards/C/C117_Legworker'
import { hasAdjacentWorker } from '../../shared/cards/C/C117_Legworker'

const CARD_ID = 'C117_Legworker'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('C117_Legworker session', () => {
  it('hasAdjacentWorker returns true when owner occupies neighbour', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    // Force farmland and grain-seeds into the state (common spaces)
    // grain-seeds is adjacent to farmland in COMMON_ADJACENCY for farmland.
    const farmland = state.actionSpaces.find((s) => s.id === 'farmland')
    const grainSeeds = state.actionSpaces.find((s) => s.id === 'grain-seeds')
    if (!farmland || !grainSeeds) return
    grainSeeds.takenBy = [{ playerId: player.id, workerId: "1" }]
    session.loadState(state)

    expect(hasAdjacentWorker(state, player.id, 'farmland')).toBe(true)
  })

  it('hasAdjacentWorker returns false when neighbour is taken by opponent', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    const opponent = state.players[1]!
    const grainSeeds = state.actionSpaces.find((s) => s.id === 'grain-seeds')
    if (!grainSeeds) return
    grainSeeds.takenBy = [{ playerId: opponent.id, workerId: "1" }]
    session.loadState(state)

    expect(hasAdjacentWorker(state, player.id, 'farmland')).toBe(false)
  })

  it('hasAdjacentWorker returns false when no neighbour is occupied', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    session.loadState(state)
    expect(hasAdjacentWorker(state, state.players[0]!.id, 'farmland')).toBe(false)
  })

  it('after-place-farmer gains 1 wood when adjacent to own worker', () => {
    const listener = findListener('C117-legworker-after-place-farmer')!
    expect(listener).toBeDefined()
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    const grainSeeds = state.actionSpaces.find((s) => s.id === 'grain-seeds')
    if (!grainSeeds) return
    grainSeeds.takenBy = [{ playerId: player.id, workerId: "1" }]
    session.loadState(state)

    const farmland = state.actionSpaces.find((s) => s.id === 'farmland')!
    const result = executeCardListener(listener, {
      state,
      player,
      space: farmland,
      actionId: 'place-farmer',
      phase: 'after',
    } as any)
    expect(result).toBeDefined()
    const leaf = result!.flow as any
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ wood: 1 })
    expect(leaf.sourceCard).toBe(CARD_ID)
  })

  it('does not trigger when no adjacent worker', () => {
    const listener = findListener('C117-legworker-after-place-farmer')!
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const farmland = state.actionSpaces.find((s) => s.id === 'farmland')!
    const result = executeCardListener(listener, {
      state,
      player,
      space: farmland,
      actionId: 'place-farmer',
      phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger without the card', () => {
    const listener = findListener('C117-legworker-after-place-farmer')!
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    const grainSeeds = state.actionSpaces.find((s) => s.id === 'grain-seeds')
    if (!grainSeeds) return
    grainSeeds.takenBy = [{ playerId: player.id, workerId: "1" }]
    session.loadState(state)

    const farmland = state.actionSpaces.find((s) => s.id === 'farmland')!
    const result = executeCardListener(listener, {
      state,
      player,
      space: farmland,
      actionId: 'place-farmer',
      phase: 'after',
    } as any)
    expect(result).toBeUndefined()
  })
})
