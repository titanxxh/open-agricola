import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardStack } from '../../shared/cards/helpers/card-state'
import { expectPublicCardGoods } from './_helpers/card-public-presentation'

import '../../shared/cards/A/A102_Grocer'
import type { AnytimeAction } from '../../shared/contract/types';
import type { SessionResponse } from '../../shared/session/session-core'

describe('A102_Grocer session', () => {
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('A102_Grocer')
    session.loadState(state)
    session.devPlayCard(0, 'A102_Grocer')
    return session
  }

  /** Take farmland action to enter active interaction with a plow choice */
  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    return resp
  }

  it('onBuy places 8 items on the stack', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const stack = getCardStack(player, 'A102_Grocer')
    expect(stack).toEqual([
      'vegetable', 'reed', 'clay', 'vegetable', 'stone', 'reed', 'grain', 'wood',
    ])
    expect(stack.length).toBe(8)
    expectPublicCardGoods(session, 'A102_Grocer', { stack })
  })

  it('anytime action appears during active interaction with food and non-empty stack', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 5
    session.loadState(state)

    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).toContain('A102-grocer-anytime')
  })

  it('anytime action not available without food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 0
    session.loadState(state)

    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('A102-grocer-anytime')
  })

  it('anytime action not available with empty stack', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 5
    // Clear the stack
    player.cardStates!['A102_Grocer']!.stack = []
    session.loadState(state)

    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('A102-grocer-anytime')
  })

  it('taking top: pay 1 food, gain wood (top of stack)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 5
    player.resources.wood = 0
    session.loadState(state)

    enterActiveInteraction(session)

    const resp = session.takeAnytimeAction(0, 'A102-grocer-anytime')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.resources.food).toBe(4) // 5 - 1
    expect(updatedPlayer.resources.wood).toBe(1)
    // Stack should now have 7 items
    const stack = getCardStack(updatedPlayer, 'A102_Grocer')
    expect(stack.length).toBe(7)
    expect(stack[stack.length - 1]).toBe('grain')
    expectPublicCardGoods(session, 'A102_Grocer', { stack })
  })

  it('second take: gain grain (new top after first take)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 5
    player.resources.wood = 0
    player.resources.grain = 0
    session.loadState(state)

    enterActiveInteraction(session)

    // First take: wood
    const resp1 = session.takeAnytimeAction(0, 'A102-grocer-anytime')
    expect(resp1.ok).toBe(true)
    expect(resp1.state.players[0]!.resources.wood).toBe(1)

    // Second take: grain
    const resp2 = session.takeAnytimeAction(0, 'A102-grocer-anytime')
    expect(resp2.ok).toBe(true)

    const updatedPlayer = resp2.state.players[0]!
    expect(updatedPlayer.resources.food).toBe(3) // 5 - 2
    expect(updatedPlayer.resources.grain).toBe(1)
    expect(updatedPlayer.resources.wood).toBe(1)
    const stack = getCardStack(updatedPlayer, 'A102_Grocer')
    expect(stack.length).toBe(6)
    expect(stack[stack.length - 1]).toBe('reed')
  })

  it('can drain the entire stack', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 10
    session.loadState(state)

    enterActiveInteraction(session)

    // Take all 8 items
    let lastResp: SessionResponse | undefined
    for (let i = 0; i < 8; i++) {
      lastResp = session.takeAnytimeAction(0, 'A102-grocer-anytime')
      expect(lastResp.ok).toBe(true)
    }

    const updatedPlayer = lastResp.state.players[0]!
    expect(updatedPlayer.resources.food).toBe(2) // 10 - 8
    const stack = getCardStack(updatedPlayer, 'A102_Grocer')
    expect(stack.length).toBe(0)
    expectPublicCardGoods(session, 'A102_Grocer', { stack: [] })

    // Verify anytime is no longer available after stack is drained
    const anytimeIds = lastResp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('A102-grocer-anytime')
  })
})
