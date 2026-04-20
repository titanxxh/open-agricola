import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/E/E108_BlackberryFarmer'
import '../../shared/cards/B/B30_WoodPalisades'

describe('E108 Blackberry Farmer — session (palisades excluded)', () => {
  it('queues future meeples for fence edges only, not palisades', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5

    const player = state.players[0]!
    // 2 fences × 1 wood + 2 palisades × 2 wood = 6
    player.resources.wood = 6
    player.occupationPlayed.push('E108_BlackberryFarmer')
    player.minorPlayed.push('B30_WoodPalisades')

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    // Tile (0,0) fenced with 2 fences + 2 palisades
    // Palisades on border: H-0-0 (top), V-0-0 (left). Fences on internal: H-1-0, V-0-1.
    resp = session.commitFarmChoice(0, 'fence', {
      edges: ['H-1-0', 'V-0-1'],
      palisadeEdges: ['H-0-0', 'V-0-0'],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)

    // Only 2 future meeples queued (one per real fence), not 4.
    const futureForCard = resp.state.futureMeeples.filter(
      (m: { cardId?: string }) => m.cardId === 'E108_BlackberryFarmer',
    )
    expect(futureForCard).toHaveLength(2)
  })
})
