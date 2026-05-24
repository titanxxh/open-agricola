import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect, runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/D/D97_BeggingStudent'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'D97_BeggingStudent'

describe('D97_BeggingStudent session', () => {
  it('onBuy gives 1 begging marker', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    const beggingBefore = player.resources.begging

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    // onBuy mutates player directly (returns void/undefined)
    effect!.onBuy!(state, player)
    expect(player.resources.begging).toBe(beggingBefore + 1)
  })

  it('onStartHarvest returns optional occupation with exactCost {} when player has occupations in hand', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.occupationHand = ['A114_SeasonalWorker']

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onStartHarvest!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
    const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children).toHaveLength(1)
    expect(children[0].actionId).toBe('occupation')
    expect(children[0].sourceCard).toBe(CARD_ID)
    expect(children[0].params).toEqual({ exactCost: {} })
  })

  it('onStartHarvest returns undefined when player has no occupations in hand', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.occupationHand = []

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onStartHarvest!(state, player)
    expect(flow).toBeUndefined()
  })

})
