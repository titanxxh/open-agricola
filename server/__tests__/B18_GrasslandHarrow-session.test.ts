import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B18_GrasslandHarrow'

const CARD_ID = 'B18_GrasslandHarrow'

describe('B18_GrasslandHarrow session', () => {
  const setupState = (round: number, resources: Partial<Record<string, number>>) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = round

    const player = state.players[0]!
    player.resources = {
      ...player.resources,
      ...resources,
    } as typeof player.resources

    session.loadState(state)
    return { session, state, player }
  }

  it('onBuy places 1 field on round = current + (WOOD + STONE + CLAY + REED)', () => {
    const { state, player } = setupState(3, {
      wood: 2, stone: 1, clay: 1, reed: 0, food: 0,
    })
    // Total building resources = 4, target round = 3 + 4 = 7.
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()

    // Verify an entry for round 7 is queued as a future meeple.
    // queueFutureMeeplesFlow pushes to pendingFutureMeeples until resolved.
    expect(state.pendingFutureMeeples.length).toBe(1)
    const req = state.pendingFutureMeeples[0]!
    if ('entries' in req) {
      expect(req.entries.map((e) => e.round)).toEqual([7])
    }
  })

  it('onBuy clamps target round to 14', () => {
    const { state, player } = setupState(12, {
      wood: 5, stone: 5, clay: 5, reed: 5, food: 0,
    })
    // 12 + 20 = 32 → clamped to 14.
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    const req = state.pendingFutureMeeples[0]!
    if ('entries' in req) {
      expect(req.entries[0]!.round).toBe(14)
    }
  })

  it('onBuy does nothing when player has 0 building resources', () => {
    const { state, player } = setupState(3, {
      wood: 0, stone: 0, clay: 0, reed: 0, food: 2,
    })
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
    expect(state.pendingFutureMeeples.length).toBe(0)
  })

  it('onRoundStart offers optional plow at the target round', () => {
    const { state, player } = setupState(3, {
      wood: 1, stone: 1, clay: 0, reed: 0, food: 0,
    })
    player.minorPlayed.push(CARD_ID)
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    // target round = 3 + 2 = 5
    state.round = 5
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeDefined()
    expect((flow as any).type).toBe('seq')
    expect((flow as any).optional).toBe(true)
    expect((flow as any).children[0].actionId).toBe('plow')
  })

  it('onRoundStart returns nothing when it is not the target round', () => {
    const { state, player } = setupState(3, {
      wood: 1, stone: 0, clay: 0, reed: 0,
    })
    player.minorPlayed.push(CARD_ID)
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    state.round = 6
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onRoundStart returns nothing when card is not played', () => {
    const { state, player } = setupState(3, {
      wood: 1, stone: 0, clay: 0, reed: 0,
    })
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    state.round = 4
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeUndefined()
  })
})
