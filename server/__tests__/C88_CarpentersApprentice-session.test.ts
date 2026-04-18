import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

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
    // 1 fence edge × 1 wood = 1, minus freeFences (capped at 1 used) → 0
    // 3 palisade edges × 2 wood = 6
    // total = 6 wood
    player.resources.wood = 6
    player.occupationPlayed.push('C88_CarpentersApprentice')
    player.minorPlayed.push('B30_WoodPalisades')

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    // Fence tile (0,0). 1 fence + 3 palisade = 4 segments (minimum).
    resp = session.commitFarmChoice(0, 'fence', {
      edges: ['H-0-0'],
      palisadeEdges: ['H-1-0', 'V-0-0', 'V-0-1'],
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
    // Only 5 wood — not enough for 6-wood palisade+fence build.
    player.resources.wood = 5
    player.occupationPlayed.push('C88_CarpentersApprentice')
    player.minorPlayed.push('B30_WoodPalisades')

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitFarmChoice(0, 'fence', {
      edges: ['H-0-0'],
      palisadeEdges: ['H-1-0', 'V-0-0', 'V-0-1'],
      extraWood: 0,
    })

    expect(resp.ok).toBe(false)
  })
})
