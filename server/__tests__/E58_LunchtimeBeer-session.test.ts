import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/E/E58_LunchtimeBeer'

const CARD_ID = 'E58_LunchtimeBeer'

describe('E58_LunchtimeBeer session', () => {
  it('onStartHarvest returns an optional flow with food gain', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.playedCards = player.playedCards ?? []
    player.playedCards.push(`minor:${CARD_ID}`)

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onStartHarvest!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as any).optional).toBe(true)
    expect((flow as any).children).toHaveLength(1)
    expect((flow as any).children[0].type).toBe('leaf')
    expect((flow as any).children[0].actionId).toBe('gain')
    expect((flow as any).children[0].params).toEqual({ food: 1 })
  })

  it('onStartHarvest returns undefined when card is not played', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    // Card not in minorPlayed

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onStartHarvest!(state, player)
    expect(flow).toBeUndefined()
  })
})
