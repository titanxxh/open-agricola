import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getCardEffect, runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/E/E96_Elder'

const CARD_ID = 'E96_Elder'

describe('E96_Elder session', () => {
  it('at round 1, offers optional free play of E96_Elder from hand', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1
    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBeforeStartOfTurn')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('seq')
    if (flow!.type === 'seq') {
      expect((flow as any).optional).toBe(true)
      const children = (flow as any).children as any[]
      expect(children).toHaveLength(1)
      expect(children[0].actionId).toBe('play-occupation')
      expect(children[0].sourceCard).toBe(CARD_ID)
      expect(children[0].params.costOverride).toEqual({})
      expect(children[0].params.allowedCards).toEqual([CARD_ID])
    }
  })

  it('does not trigger at rounds other than 1', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 2
    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBeforeStartOfTurn')
    expect(flow).toBeNull()
  })

  it('registers handHooks for onBeforeStartOfTurn', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).not.toBeNull()
    expect(effect!.handHooks).toEqual(['onBeforeStartOfTurn'])
  })
})
