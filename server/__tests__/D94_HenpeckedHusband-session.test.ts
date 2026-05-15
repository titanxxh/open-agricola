import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { D94_HenpeckedHusband_impl } from '../../shared/cards/D/D94_HenpeckedHusband'
import { recordRoundPlacement, getRoundPlacementDetails } from '../../shared/cards/helpers/round-placement'
import type { ActionHookPhase, ActionHookResult } from '../../shared/actions/hooks'
import type { CardListenerContext } from '../../shared/cards/card-listeners'

const CARD_ID = 'D94_HenpeckedHusband'

const setup = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  return { session, state, player }
}

describe('D94 HenpeckedHusband — listener', () => {
  it('triggers recall-placed-worker (workerId of first placement) when second placement (length === 2) is on construct', () => {
    const { state, player } = setup()
    // Simulate prior placement on forest, then current placement on farm-expansion.
    recordRoundPlacement(player, 'forest', '1')
    recordRoundPlacement(player, 'farm-expansion', '2')

    const handler = D94_HenpeckedHusband_impl.listeners[0]!.handler
    const ctx = {
      state,
      player,
      actionId: 'construct',
      phase: 'after' as ActionHookPhase,
    } as unknown as CardListenerContext
    const result = handler(ctx) as ActionHookResult | undefined
    expect(result).toBeTruthy()
    expect(result?.sourceCard).toBe(CARD_ID)
    const flow = result?.flow as { type: string; actionId?: string; params?: Record<string, unknown> } | undefined
    expect(flow?.type).toBe('leaf')
    expect(flow?.actionId).toBe('recall-placed-worker')
    expect(flow?.params?.workerId).toBe('1')
    expect(flow?.params?.noOpIfMissing).toBe(true)
    expect(flow?.params?.logCardTrigger).toBe(true)
  })

  it('does NOT trigger when trueAction=false', () => {
    const { state, player } = setup()
    recordRoundPlacement(player, 'forest', '1')
    recordRoundPlacement(player, 'farm-expansion', '2')

    const handler = D94_HenpeckedHusband_impl.listeners[0]!.handler
    const ctx = {
      state,
      player,
      actionId: 'construct',
      phase: 'after' as ActionHookPhase,
      trueAction: false,
    } as unknown as CardListenerContext
    expect(handler(ctx)).toBeUndefined()
  })

  it('does NOT trigger when only one placement (length === 1)', () => {
    const { state, player } = setup()
    recordRoundPlacement(player, 'farm-expansion', '1')

    const handler = D94_HenpeckedHusband_impl.listeners[0]!.handler
    const ctx = {
      state,
      player,
      actionId: 'construct',
      phase: 'after' as ActionHookPhase,
    } as unknown as CardListenerContext
    expect(handler(ctx)).toBeUndefined()
  })

  it('does NOT trigger when third placement (length === 3)', () => {
    const { state, player } = setup()
    recordRoundPlacement(player, 'forest', '1')
    recordRoundPlacement(player, 'grove', '2')
    recordRoundPlacement(player, 'farm-expansion', '3')

    const handler = D94_HenpeckedHusband_impl.listeners[0]!.handler
    const ctx = {
      state,
      player,
      actionId: 'construct',
      phase: 'after' as ActionHookPhase,
    } as unknown as CardListenerContext
    expect(handler(ctx)).toBeUndefined()
  })

  it('drops workerId when first placement is on meeting-place (recall becomes no-op)', () => {
    // The listener still fires (length === 2), but it computes the meeting-place
    // exception itself by passing workerId: undefined; the recall-placed-worker
    // action no-ops thanks to noOpIfMissing while log decoration still runs.
    const { state, player } = setup()
    recordRoundPlacement(player, 'meeting-place', '1')
    recordRoundPlacement(player, 'farm-expansion', '2')

    const handler = D94_HenpeckedHusband_impl.listeners[0]!.handler
    const ctx = {
      state,
      player,
      actionId: 'construct',
      phase: 'after' as ActionHookPhase,
    } as unknown as CardListenerContext
    const result = handler(ctx) as ActionHookResult | undefined
    expect(result).toBeTruthy()
    const flow = result?.flow as { type: string; actionId?: string; params?: Record<string, unknown> } | undefined
    expect(flow?.actionId).toBe('recall-placed-worker')
    expect(flow?.params?.workerId).toBeUndefined()
    expect(flow?.params?.noOpIfMissing).toBe(true)

    const details = getRoundPlacementDetails(player)
    expect(details).toHaveLength(2)
    expect(details[0]!.spaceId).toBe('meeting-place')
  })
})
