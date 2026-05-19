import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A123_FrameBuilder } from '../../shared/cards-display/A/A123_FrameBuilder'
import { getMaxBuildableRooms } from '../../shared/actions/payment/internal/room-payment'
import { computeAllBuyableCombinations } from '../../shared/actions/payment/internal/enumerate'
import type { PlayerState } from '../../shared/contract/types'

// Keep side-effect import referenced so registration runs.
void A123_FrameBuilder

const CARD_ID = 'A123_FrameBuilder'

/**
 * T5.3 — BGA equivalence trace for A123 construct (spec §7.1.1):
 *   3 rooms, clay house. Baseline {reed:6, clay:15}. A123 unit trade
 *   wood→clay max=3 produces k∈{0..3} swaps:
 *     k=0: {reed:6, clay:15, wood:0}
 *     k=1: {reed:6, clay:13, wood:1}
 *     k=2: {reed:6, clay:11, wood:2}
 *     k=3: {reed:6, clay:9,  wood:3}
 *   The Σ-times ≤ nb constraint (scope:'unit' budget) bounds k to ≤ nb=3.
 */

const setup3RoomsClayHouse = (resources: Record<string, number>) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.players.forEach((p) => {
    ;(p as any).minorHand = ['__test_placeholder__']
    ;(p as any).occupationHand = ['__test_placeholder__']
  })
  const player = state.players[0]!
  player.occupationPlayed = [CARD_ID]
  player.houseType = 'clay'
  player.rooms = 1
  player.roomTiles = [{ row: 2, col: 0 }]
  player.fields = []
  player.stableTiles = []
  player.pastures = []
  player.resources = {
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
    ...resources,
  }
  session.loadState(state)
  const after = session.getState().state.players[0]!
  return { session, player: after }
}

describe('A123_FrameBuilder construct — per-room wood-for-clay swap (spec §7.1.1)', () => {
  it('3 rooms no swap: {reed:6, clay:15} — affordable, k=0', () => {
    const { player } = setup3RoomsClayHouse({ clay: 15, reed: 6 })
    expect(getMaxBuildableRooms(player)).toBe(3)
    const sols = computeAllBuyableCombinations(
      player,
      { unitFee: { clay: 5, reed: 2 }, nb: 3 },
      undefined,
      'construct',
    )
    expect(sols.length).toBe(1)
    expect(sols[0]!.resourcesPaid.clay).toBe(15)
    expect(sols[0]!.resourcesPaid.reed).toBe(6)
    expect(sols[0]!.resourcesPaid.wood ?? 0).toBe(0)
    const totalSwaps = sols[0]!.tradesUsed.reduce((acc, t) => acc + t.times, 0)
    expect(totalSwaps).toBe(0)
  })

  it('3 rooms with 1 swap: {reed:6, clay:13, wood:1} affordable', () => {
    const { player } = setup3RoomsClayHouse({ clay: 13, reed: 6, wood: 1 })
    expect(getMaxBuildableRooms(player)).toBe(3)
    const sols = computeAllBuyableCombinations(
      player,
      { unitFee: { clay: 5, reed: 2 }, nb: 3 },
      undefined,
      'construct',
    )
    // Both k=0 and k=1 enumerated, but only k=1 fits resources (clay only 13).
    const affordable = sols.find((s) => (s.resourcesPaid.wood ?? 0) === 1)
    expect(affordable).toBeDefined()
    expect(affordable!.resourcesPaid.clay).toBe(13)
    expect(affordable!.resourcesPaid.reed).toBe(6)
    const totalSwaps = affordable!.tradesUsed.reduce((acc, t) => acc + t.times, 0)
    expect(totalSwaps).toBe(1)
  })

  it('3 rooms with 3 swaps: {reed:6, clay:9, wood:3} affordable — A123 trade tagged with sourceId', () => {
    const { player } = setup3RoomsClayHouse({ clay: 9, reed: 6, wood: 3 })
    expect(getMaxBuildableRooms(player)).toBe(3)
    const sols = computeAllBuyableCombinations(
      player,
      { unitFee: { clay: 5, reed: 2 }, nb: 3 },
      undefined,
      'construct',
    )
    const k3 = sols.find((s) => {
      const total = s.tradesUsed.reduce((acc, t) => acc + t.times, 0)
      return total === 3
    })
    expect(k3).toBeDefined()
    expect(k3!.resourcesPaid.clay).toBe(9)
    expect(k3!.resourcesPaid.reed).toBe(6)
    expect(k3!.resourcesPaid.wood).toBe(3)
    // Attribution: tradesUsed entry carries the A123 cardId via trade.sourceId
    // (set by applyCostModifiers in T2 spec).
    const a123Trade = k3!.tradesUsed.find((t) => t.times === 3)
    expect(a123Trade).toBeDefined()
    expect(a123Trade!.trade.sourceId).toBe(CARD_ID)
  })

  it('counter-example: {reed:6, clay:7, wood:4} cannot build 3 rooms (max=3 swap, but k=4 would be needed)', () => {
    const { player } = setup3RoomsClayHouse({ clay: 7, reed: 6, wood: 4 })
    // 3-room cost requires clay ≥ 9 even after maximum 3 swaps; clay=7 falls
    // short, so the max buildable rooms is < 3.
    expect(getMaxBuildableRooms(player)).toBeLessThan(3)
    const sols = computeAllBuyableCombinations(
      player,
      { unitFee: { clay: 5, reed: 2 }, nb: 3 },
      undefined,
      'construct',
    )
    expect(sols.length).toBe(0)
    // Σ-times ≤ nb constraint: even though the player has 4 wood, the
    // enumerator never returns a k=4 solution because the unit-scope budget
    // caps at nb=3.
  })

  it('wood house: A123 modifier filtered out — pure {wood:5, reed:2} per room', () => {
    const { player } = setup3RoomsClayHouse({ wood: 15, reed: 6 })
    ;(player as PlayerState).houseType = 'wood'
    const sols = computeAllBuyableCombinations(
      player,
      { unitFee: { wood: 5, reed: 2 }, nb: 3 },
      undefined,
      'construct',
    )
    expect(sols.length).toBe(1)
    expect(sols[0]!.resourcesPaid.wood).toBe(15)
    expect(sols[0]!.resourcesPaid.reed).toBe(6)
    const totalSwaps = sols[0]!.tradesUsed.reduce((acc, t) => acc + t.times, 0)
    expect(totalSwaps).toBe(0)
  })
})
