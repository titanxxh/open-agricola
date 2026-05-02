import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/C/C98_CubeCutter'
import type { ActionFlow } from '../../shared/game/types'

const CARD_ID = 'C98_CubeCutter'

describe('C98_CubeCutter session', () => {
  it('onBuy gives 1 wood', () => {
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
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ wood: 1 })
  })

  it('onHarvestFieldPhase returns optional pay wood+food for 1 VP', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 3
    player.resources.food = 5

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onHarvestFieldPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
    const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children).toHaveLength(2)
    // First child: pay wood+food
    expect(children[0].type).toBe('leaf')
    expect(children[0].actionId).toBe('pay')
    expect(children[0].params).toEqual({ wood: 1, food: 1 })
    // Second child: bonus-vp
    expect(children[1].type).toBe('leaf')
    expect(children[1].actionId).toBe('bonus-vp')
    expect(children[1].sourceCard).toBe(CARD_ID)
  })

  it('onHarvestFieldPhase returns undefined when player has no wood', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 0
    player.resources.food = 5

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFieldPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onHarvestFieldPhase returns undefined when player has no food', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 3
    player.resources.food = 0

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFieldPhase!(state, player)
    expect(flow).toBeUndefined()
  })

})
