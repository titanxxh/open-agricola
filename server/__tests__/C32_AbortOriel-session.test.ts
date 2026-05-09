import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

import '../../shared/cards/C/C32_AbortOriel'
import { C32_AbortOriel } from '../../shared/cards-display/C/C32_AbortOriel'

describe('C32_AbortOriel session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    return session
  }

  it('playable when no player has 5+ cards', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, C32_AbortOriel, state.round, state)).toBe(true)
  })

  it('playable as your 5th card (self has 4 before playing)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed = ['m1', 'm2', 'm3', 'm4']
    expect(meetsCardPrerequisites(player, C32_AbortOriel, state.round, state)).toBe(true)
  })

  it('blocked when self already has 5+ cards', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed = ['m1', 'm2', 'm3', 'm4', 'm5']
    expect(meetsCardPrerequisites(player, C32_AbortOriel, state.round, state)).toBe(false)
  })

  it('blocked when any opponent has 5+ cards', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const opponent = state.players[1]!
    opponent.occupationPlayed = ['o1', 'o2', 'o3']
    opponent.minorPlayed = ['m1', 'm2']
    expect(meetsCardPrerequisites(player, C32_AbortOriel, state.round, state)).toBe(false)
  })
})
