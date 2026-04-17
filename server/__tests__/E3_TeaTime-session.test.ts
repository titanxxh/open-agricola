import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import '../../shared/cards/E/E3_TeaTime'

const CARD_ID = 'E3_TeaTime'

describe('E3_TeaTime session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 2

    const owner = state.players[0]!
    owner.minorHand.push(CARD_ID)
    owner.resources.food = 5
    session.loadState(state)
    return session
  }

  it('returns the owner worker home from grain-utilization on play', () => {
    const session = setup()
    const state = session.getState().state
    const owner = state.players[0]!

    // Simulate owner has occupied grain-utilization: mark takenBy and drop a worker
    const grainSpace = state.actionSpaces.find((s) => s.id === 'grain-utilization')!
    grainSpace.takenBy = owner.id
    const workersBefore = owner.workersAvailable

    session.loadState(state)
    const resp = session.devPlayCard(0, CARD_ID)
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    const space = after.actionSpaces.find((s) => s.id === 'grain-utilization')!
    expect(space.takenBy).toEqual([])
    expect(after.players[0]!.workersAvailable).toBe(workersBefore + 1)
    expect(after.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('is a no-op when owner has no worker on grain-utilization', () => {
    const session = setup()
    const state = session.getState().state
    const owner = state.players[0]!
    // Make sure another player's worker (or none) is on the space
    const grainSpace = state.actionSpaces.find((s) => s.id === 'grain-utilization')!
    grainSpace.takenBy = state.players[1]!.id
    const workersBefore = owner.workersAvailable

    session.loadState(state)
    const resp = session.devPlayCard(0, CARD_ID)
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    const space = after.actionSpaces.find((s) => s.id === 'grain-utilization')!
    // Opponent's worker should remain
    expect(space.takenBy.some((t) => t.playerId === state.players[1]!.id)).toBe(true)
    // No extra worker returned to owner
    expect(after.players[0]!.workersAvailable).toBe(workersBefore)
  })
})
