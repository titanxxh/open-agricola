import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect, type BonusScoringContext } from '../../shared/cards/card-effects'

import '../../shared/cards/D/D060_LargePottery'

const CARD_ID = 'D060_LargePottery'

// After the solver refactor (2026-04-30), D60 reads `player.resources.clay`
// directly. The solver mutates a clone of `player` BEFORE D60's handler runs,
// so the clay it sees is the post-solve remaining. These tests pass the value
// directly via player.resources to mimic that flow (no more ctx.reserved bridge).

describe('D060_LargePottery computeBonusScore', () => {
  const ctx: BonusScoringContext = { categories: [] }

  it('clay=5 → 2 VP (matches scoresMap 5→2)', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.clay = 5
    session.loadState(state)
    const effect = getCardEffect(CARD_ID)
    const score = effect!.computeBonusScore!(state, player, ctx)
    expect(score).toBe(2)
  })

  it('clay=3 (post-solve) → 1 VP', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.clay = 3
    session.loadState(state)
    const effect = getCardEffect(CARD_ID)
    const score = effect!.computeBonusScore!(state, player, ctx)
    expect(score).toBe(1)
  })

  it('clay=0 (post-solve) → 0 VP', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.clay = 0
    session.loadState(state)
    const effect = getCardEffect(CARD_ID)
    const score = effect!.computeBonusScore!(state, player, ctx)
    expect(score).toBe(0)
  })

  it('clay=7 → 4 VP (top tier)', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.clay = 7
    session.loadState(state)
    const effect = getCardEffect(CARD_ID)
    const score = effect!.computeBonusScore!(state, player, ctx)
    expect(score).toBe(4)
  })
})
