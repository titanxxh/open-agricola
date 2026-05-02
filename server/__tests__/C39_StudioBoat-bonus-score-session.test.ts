import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/C/C39_StudioBoat'

const CARD_ID = 'C39_StudioBoat'

describe('C39_StudioBoat — computeBonusScore wiring', () => {
  it('exposes computeBonusScore on the effect', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    expect(effect!.computeBonusScore).toBeDefined()
  })

  it('returns the bonusVp counter accumulated on cardStates', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.cardStates = player.cardStates ?? {}
    player.cardStates[CARD_ID] = { counters: { bonusVp: 4 } }
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const score = effect!.computeBonusScore!(state, player, { reserved: {} })
    expect(score).toBe(4)
  })

  it('returns 0 when no counter is set', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const score = effect!.computeBonusScore!(state, player, { reserved: {} })
    expect(score).toBe(0)
  })
})
