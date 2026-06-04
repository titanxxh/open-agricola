import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

import '../../shared/cards/D/D37_Sculpture'
import { D37_Sculpture } from '../../shared/cards/D/D37_Sculpture'

describe('D37_Sculpture session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    return session
  }

  it('playable early: many rounds left, few used tiles', () => {
    const session = setup()
    const state = session.getState().state
    state.round = 1
    const player = state.players[0]!
    // Default: 2 rooms consumed. 13 tiles unused. roundsLeft=13 > 13? false
    // Adjust: 1 room only consumes 1 tile? default is 2 rooms. Let's force.
    player.roomTiles = [{ row: 2, col: 0 }]
    player.fields = []
    player.stableTiles = []
    player.pastures = []
    // used = 1, unused = 14, roundsLeft = 13 → 13 > 14 false
    expect(meetsCardPrerequisites(player, D37_Sculpture, state.round, state)).toBe(false)
    // Add more used tiles: 10 more → used=11, unused=4, roundsLeft=13 → 13>4 true
    player.fields = [
      { row: 0, col: 0, crop: null, remaining: 0 },
      { row: 0, col: 1, crop: null, remaining: 0 },
      { row: 0, col: 2, crop: null, remaining: 0 },
      { row: 0, col: 3, crop: null, remaining: 0 },
      { row: 0, col: 4, crop: null, remaining: 0 },
      { row: 1, col: 0, crop: null, remaining: 0 },
      { row: 1, col: 1, crop: null, remaining: 0 },
      { row: 1, col: 2, crop: null, remaining: 0 },
      { row: 1, col: 3, crop: null, remaining: 0 },
      { row: 1, col: 4, crop: null, remaining: 0 },
    ]
    expect(meetsCardPrerequisites(player, D37_Sculpture, state.round, state)).toBe(true)
  })

  it('playable late only if few unused tiles', () => {
    const session = setup()
    const state = session.getState().state
    state.round = 12
    const player = state.players[0]!
    // roundsLeft = 2, need unused < 2
    player.roomTiles = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
      { row: 0, col: 4 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 1, col: 4 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 2, col: 3 },
    ]
    player.fields = []
    player.stableTiles = []
    player.pastures = []
    // used = 14, unused = 1, roundsLeft = 2 → 2 > 1 true
    expect(meetsCardPrerequisites(player, D37_Sculpture, state.round, state)).toBe(true)

    // Remove one tile → unused = 2, 2 > 2 false
    player.roomTiles = player.roomTiles.slice(0, 13)
    expect(meetsCardPrerequisites(player, D37_Sculpture, state.round, state)).toBe(false)
  })
})
