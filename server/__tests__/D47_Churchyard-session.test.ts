import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { D47_Churchyard } from '../../shared/cards/D/D47_Churchyard'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('D47_Churchyard prerequisite', () => {
  it('blocks when player has fewer than 10 played cards', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['o1', 'o2', 'o3']
    player.minorPlayed = ['m1', 'm2']
    player.improvements = ['i1']
    expect(meetsCardPrerequisites(player, D47_Churchyard, state.round, state)).toBe(false)
  })

  it('allows when player has 10+ played cards', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['o1', 'o2', 'o3', 'o4']
    player.minorPlayed = ['m1', 'm2', 'm3', 'm4']
    player.improvements = ['i1', 'i2']
    expect(meetsCardPrerequisites(player, D47_Churchyard, state.round, state)).toBe(true)
  })
})
