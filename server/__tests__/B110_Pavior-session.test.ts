import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect, runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B110_Pavior'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'B110_Pavior'

describe('B110_Pavior session', () => {
  it('onRoundStart gives 1 food when player has stone', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 3

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.stone = 2
    player.resources.food = 0

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(1)
  })

  it('onRoundStart does not trigger when player has no stone', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 3

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.stone = 0
    player.resources.food = 0

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onRoundStart gives 1 vegetable in round 14', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 14

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.stone = 1
    player.resources.vegetable = 0

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.vegetable).toBe(1)
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBeUndefined()
  })

  it('onRoundStart gives food (not vegetable) in rounds other than 14', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 13

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.stone = 1

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeDefined()
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(1)
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.vegetable).toBeUndefined()
  })

})
