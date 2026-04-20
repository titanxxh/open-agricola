import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

import '../../shared/cards/E/E29_Heirloom'
import { E29_Heirloom } from '../../shared/cards/E/E29_Heirloom'

describe('E29_Heirloom session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    return session
  }

  it('blocked when day-laborer is empty', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const dl = state.actionSpaces.find((s) => s.id === 'day-laborer')
    expect(dl).toBeTruthy()
    dl!.takenBy = []
    expect(meetsCardPrerequisites(player, E29_Heirloom, state.round, state)).toBe(false)
  })

  it('playable when player has person on day-laborer', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const dl = state.actionSpaces.find((s) => s.id === 'day-laborer')!
    dl.takenBy = [{ playerId: player.id, workerId: '1' }]
    expect(meetsCardPrerequisites(player, E29_Heirloom, state.round, state)).toBe(true)
  })

  it('blocked when opponent occupies day-laborer', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const opponent = state.players[1]!
    const dl = state.actionSpaces.find((s) => s.id === 'day-laborer')!
    dl.takenBy = [{ playerId: opponent.id, workerId: '1' }]
    expect(meetsCardPrerequisites(player, E29_Heirloom, state.round, state)).toBe(false)
  })
})
