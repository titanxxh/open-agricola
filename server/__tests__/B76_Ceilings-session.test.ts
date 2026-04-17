import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import { resolveFutureMeepleRequests } from '../../shared/actions/effects/future-meeples'
import { applyFutureMeeples } from '../../shared/logic/state'

import '../../shared/cards/B/B76_Ceilings'

describe('B76_Ceilings session', () => {
  const setup = (round = 1) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round

    const player = state.players[0]!
    player.minorHand.push('B76_Ceilings')
    // Need 1 occupation to meet prerequisite
    player.occupationPlayed.push('STUB_OCC')
    session.loadState(state)
    session.devPlayCard(0, 'B76_Ceilings')
    return session
  }

  it('onBuy queues 5 future wood on next 5 rounds', () => {
    const session = setup(1)
    const state = session.getState().state

    // devPlayCard triggers onBuy which queues pendingFutureMeeples
    expect(state.pendingFutureMeeples.length).toBe(1)
    expect(state.pendingFutureMeeples[0]).toMatchObject({
      cardId: 'B76_Ceilings',
      playerId: state.players[0]!.id,
      startRound: 2,
      count: 5,
      resources: { wood: 1 },
    })

    // Resolve pending into actual futureMeeples entries
    resolveFutureMeepleRequests(state)
    expect(state.futureMeeples).toHaveLength(5)
    expect(state.futureMeeples.map((e) => e.round)).toEqual([2, 3, 4, 5, 6])
    state.futureMeeples.forEach((entry) => {
      expect(entry.cardId).toBe('B76_Ceilings')
      expect(entry.resources).toEqual({ wood: 1 })
    })
  })

  it('wood is collected at round start', () => {
    const session = setup(1)
    const state = session.getState().state
    const player = state.players[0]!
    const woodBefore = player.resources.wood

    // Resolve pending, then simulate round 2 start collection
    resolveFutureMeepleRequests(state)
    state.round = 2
    applyFutureMeeples(state)

    expect(player.resources.wood).toBe(woodBefore + 1)
    // Round 2 entry consumed, 4 remain
    expect(state.futureMeeples).toHaveLength(4)
  })

  it('after renovation, remaining future wood is removed', () => {
    const session = setup(3)
    const state = session.getState().state
    const player = state.players[0]!

    // Resolve pending: rounds 4..8
    resolveFutureMeepleRequests(state)
    expect(state.futureMeeples).toHaveLength(5)

    // Collect round 4 wood
    state.round = 4
    applyFutureMeeples(state)
    expect(state.futureMeeples).toHaveLength(4)

    // Set up renovation: wood house -> clay house needs clay=rooms + 1 reed
    player.resources.clay = player.rooms + 10
    player.resources.reed = 10
    state.round = 5

    // Make house-redevelopment action space available
    const houseRedevSpace = state.actionSpaces.find((s) => s.id === 'house-redevelopment')
    if (houseRedevSpace) {
      houseRedevSpace.roundAvailable = 1
      houseRedevSpace.takenBy = []
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)

    const updatedState = session.getState().state
    // All B76_Ceilings future meeples should be removed
    const b76Entries = updatedState.futureMeeples.filter(
      (e) => e.cardId === 'B76_Ceilings',
    )
    expect(b76Entries).toHaveLength(0)
  })

  it('card is flagged after renovation (no double removal)', () => {
    const session = setup(3)
    const state = session.getState().state
    const player = state.players[0]!

    resolveFutureMeepleRequests(state)

    // Set up renovation
    player.resources.clay = player.rooms + 10
    player.resources.reed = 10

    const houseRedevSpace = state.actionSpaces.find((s) => s.id === 'house-redevelopment')
    if (houseRedevSpace) {
      houseRedevSpace.roundAvailable = 1
      houseRedevSpace.takenBy = []
    }
    session.loadState(state)

    session.takeAction(0, 'house-redevelopment')

    const updatedState = session.getState().state
    const updatedPlayer = updatedState.players[0]!
    expect(isCardFlagged(updatedPlayer, 'B76_Ceilings')).toBe(true)
  })
})
