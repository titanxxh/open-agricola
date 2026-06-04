import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { E41_MuddyWaters } from '../../shared/cards/E/E41_MuddyWaters'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('E41_MuddyWaters prerequisite', () => {
  it('blocks when player has fewer than 5 played cards', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['o1']
    player.minorPlayed = ['m1']
    player.improvements = ['i1']
    expect(meetsCardPrerequisites(player, E41_MuddyWaters, state.round, state)).toBe(false)
  })

  it('allows when player has 5+ played cards', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['o1', 'o2']
    player.minorPlayed = ['m1', 'm2']
    player.improvements = ['i1']
    expect(meetsCardPrerequisites(player, E41_MuddyWaters, state.round, state)).toBe(true)
  })
})
