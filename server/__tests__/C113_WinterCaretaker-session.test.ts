import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getCardEffect, runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/C/C113_WinterCaretaker'

const CARD_ID = 'C113_WinterCaretaker'

describe('C113_WinterCaretaker session', () => {
  it('onBuy gives 1 grain', () => {
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
    expect((flow as any).params).toEqual({ grain: 1 })
  })

  it('onEndHarvest returns optional pay 2 food + gain 1 vegetable', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 5

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onEndHarvest!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as any).optional).toBe(true)
    const children = (flow as any).children
    expect(children).toHaveLength(2)
    // First child: pay 2 food
    expect(children[0].type).toBe('leaf')
    expect(children[0].actionId).toBe('pay-resources')
    expect(children[0].params).toEqual({ food: 2 })
    // Second child: gain 1 vegetable
    expect(children[1].type).toBe('leaf')
    expect(children[1].actionId).toBe('gain')
    expect(children[1].params).toEqual({ vegetable: 1 })
  })

  it('onEndHarvest returns undefined when player has < 2 food', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 1

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onEndHarvest!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onEndHarvest returns undefined when card is not played', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    // Card not in occupationPlayed
    player.resources.food = 5

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onEndHarvest!(state, player)
    expect(flow).toBeUndefined()
  })
})
