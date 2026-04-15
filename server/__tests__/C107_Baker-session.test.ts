import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/C/C107_Baker'

const CARD_ID = 'C107_Baker'

describe('C107_Baker session', () => {
  it('onBuy returns bake-bread action when player has grain', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.resources.grain = 2

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as any).actionId).toBe('bake-bread')
    expect((flow as any).optional).toBe(true)
    expect((flow as any).sourceCard).toBe(CARD_ID)
  })

  it('onBuy returns undefined when player has no grain', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.resources.grain = 0

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onStartHarvestFeedingPhase returns optional bake-bread when player has grain', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.playedCards = player.playedCards ?? []
    player.playedCards.push(`occupation:${CARD_ID}`)
    player.resources.grain = 3

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onStartHarvestFeedingPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as any).actionId).toBe('bake-bread')
    expect((flow as any).optional).toBe(true)
    expect((flow as any).sourceCard).toBe(CARD_ID)
  })

  it('onStartHarvestFeedingPhase returns undefined when player has no grain', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.playedCards = player.playedCards ?? []
    player.playedCards.push(`occupation:${CARD_ID}`)
    player.resources.grain = 0

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onStartHarvestFeedingPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onStartHarvestFeedingPhase returns undefined when card is not played', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.resources.grain = 3

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onStartHarvestFeedingPhase!(state, player)
    expect(flow).toBeUndefined()
  })
})
