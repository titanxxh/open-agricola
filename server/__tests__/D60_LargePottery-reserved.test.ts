import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect, type ScoringContext } from '../../shared/cards/card-effects'

import '../../shared/cards/D/D60_LargePottery'

const CARD_ID = 'D60_LargePottery'

describe('D60_LargePottery computeBonusScore', () => {
  it('clay=5, no reserved → 2 VP (matches scoresMap 5→2)', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.clay = 5
    session.loadState(state)
    const effect = getCardEffect(CARD_ID)
    const ctx: ScoringContext = { reserved: {} }
    const score = effect!.computeBonusScore!(state, player, ctx)
    expect(score).toBe(2)
  })

  it('clay=5, reserved.clay=2 → effective clay=3 → 1 VP', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.clay = 5
    session.loadState(state)
    const effect = getCardEffect(CARD_ID)
    const ctx: ScoringContext = { reserved: { clay: 2 } }
    const score = effect!.computeBonusScore!(state, player, ctx)
    expect(score).toBe(1)
  })

  it('clay=3, reserved.clay=3 → 0 VP', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.clay = 3
    session.loadState(state)
    const effect = getCardEffect(CARD_ID)
    const ctx: ScoringContext = { reserved: { clay: 3 } }
    const score = effect!.computeBonusScore!(state, player, ctx)
    expect(score).toBe(0)
  })

  it('clay=10, reserved.clay=10 → 0 VP', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.clay = 10
    session.loadState(state)
    const effect = getCardEffect(CARD_ID)
    const ctx: ScoringContext = { reserved: { clay: 10 } }
    const score = effect!.computeBonusScore!(state, player, ctx)
    expect(score).toBe(0)
  })
})
