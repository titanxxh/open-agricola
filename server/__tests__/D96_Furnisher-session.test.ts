import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/D/D096_Furnisher'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'D096_Furnisher'

const setup = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  player.occupationHand.push(CARD_ID)
  player.resources.food = 10
  player.resources.wood = 20
  player.resources.clay = 20
  player.resources.reed = 20
  player.resources.stone = 20
  session.loadState(state)
  session.devPlayCard(0, CARD_ID)
  return session
}

describe('D096_Furnisher session', () => {
  it('card is registered after devPlayCard', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    expect(player.occupationPlayed).toContain(CARD_ID)
  })

  it('onBuy gives 2 wood', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ wood: 2 })
  })
})
