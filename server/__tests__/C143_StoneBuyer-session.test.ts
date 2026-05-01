import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setCardFlag, isCardFlagged } from '../../shared/cards/helpers/card-state'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/C/C143_StoneBuyer'
import type { AnytimeAction } from '../../shared/game/types';
import type { ActionFlow } from '../../shared/game/types'

describe('C143_StoneBuyer session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('C143_StoneBuyer')
    player.resources.food = 5
    player.resources.stone = 0
    session.loadState(state)
    session.devPlayCard(0, 'C143_StoneBuyer')
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('onBuy: returns a seq flow that pays 1 food, gains 2 stone, and flags card', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'C143_StoneBuyer', 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('seq')
    const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children).toHaveLength(3)
    expect(children[0].actionId).toBe('pay-resources')
    expect(children[0].params).toEqual({ food: 1 })
    expect(children[1].actionId).toBe('gain')
    expect(children[1].params).toEqual({ stone: 2 })
    expect(children[2]).toMatchObject({ actionId: 'special-effect', params: { kind: 'set-flag', flag: true } })
  })

  it('anytime not available same round when flagged from onBuy', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    // Simulate onBuy having executed (which flags the card)
    setCardFlag(player, 'C143_StoneBuyer', true)
    session.loadState(state)

    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('C143-stone-buyer-anytime')
  })

  it('after flag reset: pay 2 food, gain 1 stone, gets flagged', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    // Ensure card is not flagged (simulating flag was reset at start of turn)
    setCardFlag(player, 'C143_StoneBuyer', false)
    player.resources.food = 5
    player.resources.stone = 0
    session.loadState(state)

    enterActiveInteraction(session)

    const resp2 = session.takeAnytimeAction(0, 'C143-stone-buyer-anytime')
    expect(resp2.ok).toBe(true)

    const updatedPlayer = resp2.state.players[0]!
    expect(updatedPlayer.resources.food).toBe(3) // 5 - 2
    expect(updatedPlayer.resources.stone).toBe(1) // 0 + 1
    expect(isCardFlagged(updatedPlayer, 'C143_StoneBuyer')).toBe(true)
  })

  it('not available without 2 food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    setCardFlag(player, 'C143_StoneBuyer', false)
    player.resources.food = 1 // Not enough (need 2)
    session.loadState(state)

    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('C143-stone-buyer-anytime')
  })
})
