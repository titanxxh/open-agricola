import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { E043_BarnCats } from '../../shared/cards/E/E043_BarnCats'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('E043_BarnCats prerequisite', () => {
  it('blocks when player owns no stable', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.stableTiles = []
    expect(meetsCardPrerequisites(player, E043_BarnCats, state.round, state)).toBe(false)
  })

  it('allows when player has at least 1 stable', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.stableTiles = [{ row: 0, col: 4 }]
    expect(meetsCardPrerequisites(player, E043_BarnCats, state.round, state)).toBe(true)
  })

  it('allows when the only stable is the B85 FarmHand stable (card-facing count)', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.stableTiles = []
    player.occupationPlayed.push('B085_FarmHand')
    player.cardStates = {
      B085_FarmHand: { extraData: { position: { row: 0, col: 0 } } },
    }
    expect(meetsCardPrerequisites(player, E043_BarnCats, state.round, state)).toBe(true)
  })
})
