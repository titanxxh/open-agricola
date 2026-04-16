import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getExtraRoomCapacity } from '../../shared/cards/card-effects'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

import '../../shared/cards/A/A10_WoodenShed'
import { A10_WoodenShed } from '../../shared/cards/A/A10_WoodenShed'

const CARD_ID = 'A10_WoodenShed'

describe('A10_WoodenShed session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    return session
  }

  it('prerequisite passes in wood house', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    expect(player.houseType).toBe('wood')
    expect(meetsCardPrerequisites(player, A10_WoodenShed, state.round, state)).toBe(true)
  })

  it('prerequisite fails when house is clay', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'clay'
    expect(meetsCardPrerequisites(player, A10_WoodenShed, state.round, state)).toBe(false)
  })

  it('adds +1 extra room capacity when played', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    expect(getExtraRoomCapacity(player)).toBe(0)
    player.minorPlayed.push(CARD_ID)
    expect(getExtraRoomCapacity(player)).toBe(1)
  })
})
