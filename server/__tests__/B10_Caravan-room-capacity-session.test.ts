import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B10_Caravan'
import '../../shared/cards/register-all'

const CARD_ID = 'B10_Caravan'

describe('B10_Caravan — provides room for 1 person via computeExtraRoomCapacity', () => {
  it('exposes computeExtraRoomCapacity on the effect', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    expect(effect!.computeExtraRoomCapacity).toBeDefined()
  })

  it('returns 1 when the card is in player.minorPlayed', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect!.computeExtraRoomCapacity!(player)).toBe(1)
  })

  it('returns 0 when the card is not played', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect!.computeExtraRoomCapacity!(player)).toBe(0)
  })
})
