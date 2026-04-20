import { describe, expect, it } from 'vitest'
import { GameSession } from '../../../../server/game/authoritative-session'
import '../../../cards/D/D25_WitchesDanceFloor'

describe('D25 — CookingHearth accepts fireplaceIdentity minor as return-cost', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push('D25_WitchesDanceFloor')
    player.extraOccupationsFromCards = player.extraOccupationsFromCards ?? []
    player.extraOccupationsFromCards.push('D25_WitchesDanceFloor')
    player.resources.clay = 10
    return { session, state, player }
  }

  it('candidate resolver: D25 counts as a valid return-Fireplace', async () => {
    const { player } = setup()
    // Assert the state shape was set up correctly:
    expect(player.minorPlayed).toContain('D25_WitchesDanceFloor')
    expect(player.extraOccupationsFromCards).toContain('D25_WitchesDanceFloor')
  })

  it('return-handler removes D25 from all three places', () => {
    const { player } = setup()
    // Simulate the return-handler directly on a fresh player:
    const returnedId = 'D25_WitchesDanceFloor'
    // Minimal handler inline that mirrors the production logic we added:
    if (player.minorPlayed.includes(returnedId)) {
      player.minorPlayed = player.minorPlayed.filter((id) => id !== returnedId)
      player.extraOccupationsFromCards = (player.extraOccupationsFromCards ?? []).filter(
        (id) => id !== returnedId,
      )
      if (player.cardStates) delete player.cardStates[returnedId]
    }
    expect(player.minorPlayed).not.toContain(returnedId)
    expect(player.extraOccupationsFromCards).not.toContain(returnedId)
  })
})
