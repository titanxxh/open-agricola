import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { getCardStack } from '../../shared/cards/helpers/card-state'

import { familySize } from '../../shared/game/player'
import '../../shared/cards/E/E22_GuestRoom'

const CARD_ID = 'E22_GuestRoom'

describe('E22_GuestRoom session', () => {
  const setup = (food = 5) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.resources.food = food
    player.minorPlayed.push(CARD_ID)

    // Manually trigger onBuy
    runCardEffectHook(state, player, CARD_ID, 'onBuy')

    session.loadState(state)
    return session
  }

  /** Enter an active interaction that keeps the engine alive (multi-step). */
  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('onBuy stores all food on card stack and zeroes player food', () => {
    const session = setup(5)
    const state = session.getState().state
    const player = state.players[0]!
    expect(player.resources.food).toBe(0)
    const stack = getCardStack(player, CARD_ID)
    expect(stack.length).toBe(5)
    expect(stack.every((item) => item === 'food')).toBe(true)
  })

  it('onBuy with 0 food stores empty stack', () => {
    const session = setup(0)
    const state = session.getState().state
    const player = state.players[0]!
    const stack = getCardStack(player, CARD_ID)
    expect(stack.length).toBe(0)
  })

  it('anytime action uses 1 food from card for family growth', () => {
    const session = setup(3)

    // Enter an active interaction (farmland stays in choice state)
    enterActiveInteraction(session)

    // Now take anytime action
    const anytimeResp = session.takeAnytimeAction(0, 'E22-guest-room-anytime')
    expect(anytimeResp.ok).toBe(true)

    const player = anytimeResp.state.players[0]!
    // Family should grow
    expect(familySize(player)).toBe(3) // started with 2
    // Food on card should decrease (stack: 3 → 2)
    const stack = getCardStack(player, CARD_ID)
    expect(stack.length).toBe(2)
  })

  it('anytime action not available when card has no food', () => {
    const session = setup(0) // onBuy stores 0 food

    const resp = enterActiveInteraction(session)

    // Anytime should not be listed
    const anytimeIds = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(anytimeIds).not.toContain('E22-guest-room-anytime')
  })

  it('anytime limited to once per round', () => {
    const session = setup(5)

    enterActiveInteraction(session)

    // First anytime: should succeed
    const anytime1 = session.takeAnytimeAction(0, 'E22-guest-room-anytime')
    expect(anytime1.ok).toBe(true)

    // Second anytime: should fail (flagged)
    const anytime2 = session.takeAnytimeAction(0, 'E22-guest-room-anytime')
    expect(anytime2.ok).toBe(false)
  })
})
