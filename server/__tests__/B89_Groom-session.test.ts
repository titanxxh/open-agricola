import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B089_Groom'
import type { ActionFlow } from '../../shared/contract/types'

describe('B089_Groom session', () => {
  const setup = (options?: { houseType?: 'wood' | 'clay' | 'stone' }) => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('B089_Groom')
    player.houseType = options?.houseType ?? 'stone'
    player.resources.wood = 0
    player.resources.food = 10
    session.loadState(state)
    session.devPlayCard(0, 'B089_Groom')
    return session
  }

  it('onBuy returns gain 1 wood flow', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'B089_Groom', 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ wood: 1 })
  })

  it('onBeforeStartOfTurn in stone house returns single optional stables leaf with internal cost', () => {
    const session = setup({ houseType: 'stone' })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 3 // enough for stable

    const flow = runCardEffectHook(state, player, 'B089_Groom', 'onBeforeStartOfTurn')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('stables')
    expect(leaf.optional).toBe(true)
    expect(leaf.actionContext?.max).toBe(1)
    expect(leaf.actionContext?.exactCost).toEqual({ wood: 1, max: 1 })
    expect(leaf.actionContext?.costOverride).toBeUndefined()
  })

  it('onBeforeStartOfTurn in stone house with 0 wood: still emits trigger (no upfront block)', () => {
    const session = setup({ houseType: 'stone' })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 0

    const flow = runCardEffectHook(state, player, 'B089_Groom', 'onBeforeStartOfTurn')
    // BGA does not block at trigger time — payability is checked when player
    // chooses to act. Effect must still emit the leaf.
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('stables')
    expect(leaf.optional).toBe(true)
  })

  it('onBeforeStartOfTurn does not trigger in clay house', () => {
    const session = setup({ houseType: 'clay' })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 3

    const flow = runCardEffectHook(state, player, 'B089_Groom', 'onBeforeStartOfTurn')
    expect(flow).toBeNull()
  })

  it('onBeforeStartOfTurn does not trigger in wood house', () => {
    const session = setup({ houseType: 'wood' })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 3

    const flow = runCardEffectHook(state, player, 'B089_Groom', 'onBeforeStartOfTurn')
    expect(flow).toBeNull()
  })
})
