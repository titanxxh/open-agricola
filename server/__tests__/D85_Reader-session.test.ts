import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getExtraRoomCapacity } from '../../shared/cards/card-effects'

import '../../shared/cards/D/D085_Reader'

const CARD_ID = 'D085_Reader'

describe('D085_Reader session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    return session
  }

  it('grants no extra room below 6 occupations', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['a', 'b', 'c', 'd', CARD_ID] // 5 total
    expect(getExtraRoomCapacity(player)).toBe(0)
  })

  it('grants +1 at 6 occupations (including self)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['a', 'b', 'c', 'd', 'e', CARD_ID]
    expect(getExtraRoomCapacity(player)).toBe(1)
  })

  it('grants +1 at more than 6 occupations', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['a', 'b', 'c', 'd', 'e', 'f', 'g', CARD_ID]
    expect(getExtraRoomCapacity(player)).toBe(1)
  })

  it('grants nothing if card not in play', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['a', 'b', 'c', 'd', 'e', 'f']
    expect(getExtraRoomCapacity(player)).toBe(0)
  })
})
