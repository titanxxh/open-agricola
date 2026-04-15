import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B89_Groom'

describe('B89_Groom session', () => {
  const setup = (options?: { houseType?: 'wood' | 'clay' | 'stone' }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('B89_Groom')
    player.houseType = options?.houseType ?? 'stone'
    player.resources.wood = 0
    player.resources.food = 10
    session.loadState(state)
    session.devPlayCard(0, 'B89_Groom')
    return session
  }

  it('onBuy returns gain 1 wood flow', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'B89_Groom', 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    expect((flow as any).actionId).toBe('gain')
    expect((flow as any).params).toEqual({ wood: 1 })
  })

  it('onBeforeStartOfTurn returns optional stable flow in stone house', () => {
    const session = setup({ houseType: 'stone' })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 3 // enough for stable

    const flow = runCardEffectHook(state, player, 'B89_Groom', 'onBeforeStartOfTurn')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('seq')
    expect((flow as any).optional).toBe(true)
    // Should contain pay-resources and stables children
    const children = (flow as any).children
    expect(children).toHaveLength(2)
    expect(children[0].actionId).toBe('pay-resources')
    expect(children[0].params).toEqual({ wood: 1 })
    expect(children[1].actionId).toBe('stables')
  })

  it('onBeforeStartOfTurn does not trigger in clay house', () => {
    const session = setup({ houseType: 'clay' })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 3

    const flow = runCardEffectHook(state, player, 'B89_Groom', 'onBeforeStartOfTurn')
    expect(flow).toBeNull()
  })

  it('onBeforeStartOfTurn does not trigger in wood house', () => {
    const session = setup({ houseType: 'wood' })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 3

    const flow = runCardEffectHook(state, player, 'B89_Groom', 'onBeforeStartOfTurn')
    expect(flow).toBeNull()
  })

  it('onBeforeStartOfTurn does not trigger without wood', () => {
    const session = setup({ houseType: 'stone' })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 0

    const flow = runCardEffectHook(state, player, 'B89_Groom', 'onBeforeStartOfTurn')
    expect(flow).toBeNull()
  })
})
