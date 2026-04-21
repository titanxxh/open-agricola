import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/E/E58_LunchtimeBeer'
import type { ActionFlow } from '../../shared/game/types'

const CARD_ID = 'E58_LunchtimeBeer'

describe('E58_LunchtimeBeer session', () => {
  it('onStartHarvest returns an optional flow with food gain', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onStartHarvest!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
    expect((flow as Extract<ActionFlow, { type: 'seq' }>).children).toHaveLength(1)
    expect((flow as Extract<ActionFlow, { type: 'seq' }>).children[0].type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'seq' }>).children[0].actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'seq' }>).children[0].params).toEqual({ food: 1 })
  })

})
