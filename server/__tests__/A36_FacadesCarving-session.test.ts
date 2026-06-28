import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A036_FacadesCarving } from '../../shared/cards/A/A036_FacadesCarving'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('A036_FacadesCarving prerequisite', () => {
  it('blocks when wood in supply < current round', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.round = 5
    const player = state.players[0]!
    player.resources.wood = 4
    expect(meetsCardPrerequisites(player, A036_FacadesCarving, state.round, state)).toBe(false)
  })

  it('allows when wood in supply >= current round', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.round = 5
    const player = state.players[0]!
    player.resources.wood = 5
    expect(meetsCardPrerequisites(player, A036_FacadesCarving, state.round, state)).toBe(true)
  })
})
