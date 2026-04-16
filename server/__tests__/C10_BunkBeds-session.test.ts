import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getExtraRoomCapacity } from '../../shared/cards/card-effects'

import '../../shared/cards/C/C10_BunkBeds'

const CARD_ID = 'C10_BunkBeds'

describe('C10_BunkBeds session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    return session
  }

  it('does nothing when not played', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.rooms = 5
    expect(getExtraRoomCapacity(player)).toBe(0)
  })

  it('grants no extra room below 4 rooms', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.rooms = 3
    expect(getExtraRoomCapacity(player)).toBe(0)
  })

  it('grants +1 extra room at exactly 4 rooms', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.rooms = 4
    expect(getExtraRoomCapacity(player)).toBe(1)
  })

  it('grants +1 extra room at 5 rooms too', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.rooms = 5
    expect(getExtraRoomCapacity(player)).toBe(1)
  })
})
