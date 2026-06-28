import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A033_BigCountry } from '../../shared/cards/A/A033_BigCountry'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { getAllTilePositions } from '../../shared/domain/farm'

describe('A033_BigCountry prerequisite', () => {
  it('blocks when there is at least one free farmyard space', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, A033_BigCountry, state.round, state)).toBe(false)
  })

  it('allows when all 15 farmyard spaces are used', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    // Cover the 15 spaces by stuffing them as roomTiles for the prereq check.
    player.roomTiles = getAllTilePositions()
    player.fields = []
    player.stableTiles = []
    player.pastures = []
    expect(meetsCardPrerequisites(player, A033_BigCountry, state.round, state)).toBe(true)
  })
})
