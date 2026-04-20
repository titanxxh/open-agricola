import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/C/C88_CarpentersApprentice'
import '../../shared/cards/B/B30_WoodPalisades'

describe('C88 Carpenter\'s Apprentice — session w/ palisades', () => {
  it('freeFences discount fences only; palisades still cost full wood', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    // No existing fences → freeFences = 15
    // 2 fence edges × 1 wood = 2, minus freeFences (2 used) → 0
    // 2 palisade edges × 2 wood = 4
    // total = 4 wood
    player.resources.wood = 4
    player.occupationPlayed.push('C88_CarpentersApprentice')
    player.minorPlayed.push('B30_WoodPalisades')

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    // Fence tile (0,0). 2 fences (internal) + 2 palisades (border).
    // Palisades must be on border: H-0-0 (top), V-0-0 (left).
    // Fences on internal: H-1-0, V-0-1.
    resp = session.commitFarmChoice(0, 'fence', {
      edges: ['H-1-0', 'V-0-1'],
      palisadeEdges: ['H-0-0', 'V-0-0'],
      extraWood: 0,
    })

    expect(resp.ok).toBe(true)
    const result = resp.state.players[0]!
    // Wood fully consumed
    expect(result.resources.wood).toBe(0)
    expect(result.pastures).toHaveLength(1)
  })

  it('rejects insufficient wood when palisades dominate (no double-discount)', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    // Only 3 wood — not enough for 4-wood palisade+fence build (2 palisades @ 2 each).
    player.resources.wood = 3
    player.occupationPlayed.push('C88_CarpentersApprentice')
    player.minorPlayed.push('B30_WoodPalisades')

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    // Same layout as above but insufficient wood.
    resp = session.commitFarmChoice(0, 'fence', {
      edges: ['H-1-0', 'V-0-1'],
      palisadeEdges: ['H-0-0', 'V-0-0'],
      extraWood: 0,
    })

    expect(resp.ok).toBe(false)
  })
})
