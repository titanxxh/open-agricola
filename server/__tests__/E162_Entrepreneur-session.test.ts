import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { getCardStack, pushToCardStack } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/E/E162_Entrepreneur'
import type { ActionFlow } from '../../shared/game/types'

const CARD_ID = 'E162_Entrepreneur'

describe('E162_Entrepreneur session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    session.loadState(state)
    return session
  }

  it('onBeforeStartOfTurn returns optional XOR when food available and missing resources', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    // Give player food but no wood
    player.resources.food = 3
    player.resources.wood = 0
    player.resources.clay = 1
    player.resources.reed = 1
    player.resources.stone = 1

    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBeforeStartOfTurn')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('xor')
    if (flow!.type === 'xor') {
      expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
      // Option A: pay food + push to stack + gain wood
      expect((flow as Extract<ActionFlow, { type: 'seq' }>).children.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('returns null when player has all building resources', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    player.resources.food = 3
    player.resources.wood = 1
    player.resources.clay = 1
    player.resources.reed = 1
    player.resources.stone = 1

    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBeforeStartOfTurn')
    expect(flow).toBeNull()
  })

  it('returns null when no food available (neither on player nor on card)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    player.resources.food = 0
    player.resources.wood = 0 // missing resource

    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBeforeStartOfTurn')
    expect(flow).toBeNull()
  })

  it('offers only option B (discard from card) when player has no food but stack has food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    player.resources.food = 0
    player.resources.wood = 0 // missing
    // Push food onto card stack
    pushToCardStack(player, CARD_ID, ['food'])

    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBeforeStartOfTurn')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('xor')
    if (flow!.type === 'xor') {
      // Only option B since player has no food
      expect((flow as Extract<ActionFlow, { type: 'seq' }>).children.length).toBe(1)
    }
  })

  it('offers both options when player has food and stack has food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    player.resources.food = 2
    player.resources.wood = 0 // missing
    pushToCardStack(player, CARD_ID, ['food'])

    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBeforeStartOfTurn')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('xor')
    if (flow!.type === 'xor') {
      expect((flow as Extract<ActionFlow, { type: 'seq' }>).children.length).toBe(2)
    }
  })
})
