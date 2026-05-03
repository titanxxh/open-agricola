import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A57_MilkingParlor } from '../../shared/cards/A/A57_MilkingParlor'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { getAllTilePositions } from '../../shared/game/farm'

describe('A57_MilkingParlor prerequisite', () => {
  it('blocks when fewer than 4 free farmyard spaces remain', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.roomTiles = getAllTilePositions().slice(0, 12)
    player.fields = []
    player.stableTiles = []
    player.pastures = []
    expect(meetsCardPrerequisites(player, A57_MilkingParlor, state.round, state)).toBe(false)
  })

  it('allows when at least 4 free spaces remain', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, A57_MilkingParlor, state.round, state)).toBe(true)
  })
})
