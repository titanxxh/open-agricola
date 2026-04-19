import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B116_Shoreforester'

const CARD_ID = 'B116_Shoreforester'

describe('B116_Shoreforester session', () => {
  it('onBuy returns a gain-1-wood flow', () => {
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
    expect((flow as any).params?.wood).toBe(1)
  })

  it('onRoundStart gives 1 wood when card is played', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 3

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 0

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as any).params?.wood).toBe(1)
  })


  it('onRoundStart triggers in any round', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 0

    session.loadState(state)
    const effect = getCardEffect(CARD_ID)

    // Check multiple rounds — should always give wood
    for (const round of [1, 5, 10, 14]) {
      state.round = round
      const flow = effect!.onRoundStart!(state, player)
      expect(flow).toBeDefined()
      expect((flow as any).params?.wood).toBe(1)
    }
  })
})
