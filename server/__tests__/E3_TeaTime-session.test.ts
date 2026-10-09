import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { workersAvailable } from '../../shared/domain/player'
import { E003_TeaTime } from '../../shared/cards/E/E003_TeaTime'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

const CARD_ID = 'E003_TeaTime'

describe('E003_TeaTime session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
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

    // Simulate owner has occupied grain-utilization: place one of owner's workers there
    const grainSpace = state.actionSpaces.find((s) => s.id === 'grain-utilization')!
    const ownerWorker = owner.workers.find((w) => w.isActive)!
    grainSpace.takenBy = [{ playerId: owner.id, workerId: ownerWorker.id }]
    const workersBefore = workersAvailable(state, owner)

    session.loadState(state)
    const resp = session.devPlayCard(0, CARD_ID)
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    const space = after.actionSpaces.find((s) => s.id === 'grain-utilization')!
    expect(space.takenBy).toEqual([])
    expect(workersAvailable(after, after.players[0]!)).toBe(workersBefore + 1)
    expect(after.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('is a no-op when owner has no worker on grain-utilization', () => {
    const session = setup()
    const state = session.getState().state
    const owner = state.players[0]!
    // Make sure another player's worker is on the space
    const grainSpace = state.actionSpaces.find((s) => s.id === 'grain-utilization')!
    const other = state.players[1]!
    const otherWorker = other.workers.find((w) => w.isActive)!
    grainSpace.takenBy = [{ playerId: other.id, workerId: otherWorker.id }]
    const workersBefore = workersAvailable(state, owner)

    session.loadState(state)
    const resp = session.devPlayCard(0, CARD_ID)
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    const space = after.actionSpaces.find((s) => s.id === 'grain-utilization')!
    // Opponent's worker should remain
    expect(space.takenBy.some((t) => t.playerId === state.players[1]!.id)).toBe(true)
    // No extra worker returned to owner
    expect(workersAvailable(after, after.players[0]!)).toBe(workersBefore)
  })

  describe('prerequisite "Own Person on Grain Utilization"', () => {
    it('blocks when no own worker is on Grain Utilization', () => {
      const session = new GameSession(42)
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      const player = state.players[0]!
      const space = state.actionSpaces.find((s) => s.id === 'grain-utilization')
      if (space) space.takenBy = []
      expect(meetsCardPrerequisites(player, E003_TeaTime, state.round, state)).toBe(false)
    })

    it('allows when own worker sits on Grain Utilization', () => {
      const session = new GameSession(42)
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      const player = state.players[0]!
      const space = state.actionSpaces.find((s) => s.id === 'grain-utilization')!
      space.takenBy = [{ playerId: player.id, workerId: player.workers[0]!.id }]
      expect(meetsCardPrerequisites(player, E003_TeaTime, state.round, state)).toBe(true)
    })
  })
})
