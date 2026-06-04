import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A40_PottersYard } from '../../shared/cards/A/A40_PottersYard'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { getAllTilePositions } from '../../shared/domain/farm'

describe('A40_PottersYard prerequisite', () => {
  it('blocks when player has more than 7 free farmyard spaces', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, A40_PottersYard, state.round, state)).toBe(false)
  })

  it('allows when free spaces <= 7 (e.g. 8 spaces used)', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.roomTiles = getAllTilePositions().slice(0, 8)
    player.fields = []
    player.stableTiles = []
    player.pastures = []
    expect(meetsCardPrerequisites(player, A40_PottersYard, state.round, state)).toBe(true)
  })
})
