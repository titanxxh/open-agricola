import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/D/D84_FeedPellets'

const CARD_ID = 'D84_FeedPellets'

describe('D84_FeedPellets session', () => {
  it('onBuy returns gain 1 sheep flow', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as any).actionId).toBe('gain')
    expect((flow as any).params?.sheep).toBe(1)
  })

  it('offers exchange during feeding when player has vegetable and sheep', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 2
    player.resources.sheep = 3

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeDefined()
    // Only sheep owned → single seq (not xor)
    expect(flow!.type).toBe('seq')
    expect((flow as any).optional).toBe(true)
  })

  it('offers xor when player has multiple animal types', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 1
    player.resources.sheep = 2
    player.resources.boar = 1

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
    expect((flow as any).optional).toBe(true)
    expect((flow as any).children.length).toBe(2) // sheep and boar
  })

  it('returns undefined during feeding when no vegetable', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 0
    player.resources.sheep = 5

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('returns undefined during feeding when no animals owned', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 3
    player.resources.sheep = 0
    player.resources.boar = 0
    player.resources.cattle = 0

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeUndefined()
  })

})
