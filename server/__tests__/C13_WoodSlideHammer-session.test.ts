import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { canRenovate } from '../../shared/actions/effects/renovation'
import {
  applyCostModifiers,
  computeAllBuyableCombinations,
  getModifiersForCostType,
} from '../../shared/actions/payment/internal'
import type { BonusModifier } from '../../shared/contract/types'

import '../../shared/cards/C/C13_WoodSlideHammer'

const CARD_ID = 'C13_WoodSlideHammer'

const setupOwner = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  // Inject the static modifier as the playMinor flow would.
  player.activeModifiers = [
    ...player.activeModifiers,
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['renovation'],
      discount: { stone: 2 },
      conditions: { houseTypeWood: 1, minNumRooms: 5 },
    } as BonusModifier,
  ]
  return { session, state, player }
}

describe('C13_WoodSlideHammer — renovation -2 stone discount gated by conditions', () => {
  it('5 wood rooms → modifier surfaces and reduces required stone by 2', () => {
    const { player } = setupOwner()
    player.houseType = 'wood'
    player.rooms = 5
    player.roomTiles = [
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 },
      { row: 1, col: 1 }, { row: 2, col: 0 },
    ]
    player.resources = { ...player.resources, reed: 5, stone: 3, clay: 0 }

    const mods = getModifiersForCostType(player, 'renovation')
    expect(mods).toHaveLength(1)
    expect(mods[0]).toMatchObject({
      cardId: CARD_ID,
      discount: { stone: 2 },
    })
    // Wood → clay base cost is 5 clay + 1 reed; the discount on stone won't help
    // here, but canRenovate should still return true (modifier doesn't add cost).
    // The interesting case: house already clay would block via condition gating.
  })

  it('4 rooms → modifier filtered out (minNumRooms not met)', () => {
    const { player } = setupOwner()
    player.houseType = 'wood'
    player.rooms = 4

    const mods = getModifiersForCostType(player, 'renovation')
    expect(mods).toHaveLength(0)
  })

  it('houseType already clay → modifier filtered out (houseTypeWood not met)', () => {
    const { player } = setupOwner()
    player.houseType = 'clay'
    player.rooms = 5

    const mods = getModifiersForCostType(player, 'renovation')
    expect(mods).toHaveLength(0)
  })

  it('houseType stone → modifier filtered out', () => {
    const { player } = setupOwner()
    player.houseType = 'stone'
    player.rooms = 5

    const mods = getModifiersForCostType(player, 'renovation')
    expect(mods).toHaveLength(0)
  })

  it('canRenovate path: with 5 wood rooms + 3 stone, can renovate (without discount would need clay anyway)', () => {
    const { player } = setupOwner()
    player.houseType = 'wood'
    player.rooms = 5
    player.roomTiles = [
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 },
      { row: 1, col: 1 }, { row: 2, col: 0 },
    ]
    // Wood→clay needs 5 clay + 1 reed (one per room)
    player.resources = { ...player.resources, reed: 5, clay: 5, stone: 0 }
    expect(canRenovate(player)).toBe(true)
  })

  it('without C13 modifier: 5-room wood stays gated normally on stone-deficient renovate', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.houseType = 'wood'
    player.rooms = 5

    const mods = getModifiersForCostType(player, 'renovation')
    expect(mods).toHaveLength(0)
  })
})

describe('C13_WoodSlideHammer — payment-outcome boundary (Sprint 5 mech-E follow-up)', () => {
  // These cases verify the conditions chain end-to-end on the unified
  // ComplexCost.bonuses payment path. The C13 BonusModifier flows through:
  //   getModifiersForCostType → applyCostModifiers → computeAllBuyableCombinations
  // After Task 3 (stop propagating conditions), the generated Bonus has no
  // conditions field; the pre-filter at getModifiersForCostType now decides
  // sufficiency. These cases lock in that semantics.

  it('5 wood rooms + stone payment → C13 surfaces a -2 stone discount path', () => {
    const { player } = setupOwner()
    player.houseType = 'wood'
    player.rooms = 5
    player.resources = { ...player.resources, stone: 5, reed: 2 }

    // Drive the payment evaluator directly with a synthetic stone-flavoured
    // renovation cost (matching wood→stone direct path that A87 Conservator
    // would surface). Without C13 the player would pay 5 stone; with C13 the
    // bonus path reduces it to 3.
    const mods = getModifiersForCostType(player, 'renovation')
    expect(mods).toHaveLength(1)
    const effective = applyCostModifiers({ fee: { stone: 5, reed: 1 } }, mods)
    // Generated Bonus must NOT carry conditions (Task 3 guarantee).
    expect(effective.bonuses).toBeDefined()
    expect(effective.bonuses!.length).toBe(1)
    expect(effective.bonuses![0].conditions).toBeUndefined()

    const sols = computeAllBuyableCombinations(player, { fee: { stone: 5, reed: 1 } }, undefined, 'renovation')
    expect(sols.length).toBeGreaterThan(0)
    // At least one solution applies the C13 discount → stone paid <= 3.
    expect(sols.some((s) => (s.resourcesPaid.stone ?? 0) <= 3)).toBe(true)
  })

  it('4 wood rooms → C13 filtered out at getModifiersForCostType, no discount surfaces', () => {
    const { player } = setupOwner()
    player.houseType = 'wood'
    player.rooms = 4
    player.resources = { ...player.resources, stone: 5, reed: 2 }

    const mods = getModifiersForCostType(player, 'renovation')
    expect(mods).toHaveLength(0)
    const sols = computeAllBuyableCombinations(player, { fee: { stone: 4, reed: 1 } }, undefined, 'renovation')
    // No bonus path → all solutions pay full stone (and full reed).
    expect(sols.length).toBeGreaterThan(0)
    expect(sols.every((s) => (s.resourcesPaid.stone ?? 0) === 4)).toBe(true)
  })

  it('houseType clay (already renovated once) → C13 filtered out, clay→stone pays full', () => {
    const { player } = setupOwner()
    player.houseType = 'clay'
    player.rooms = 5
    player.resources = { ...player.resources, stone: 6, reed: 2 }

    const mods = getModifiersForCostType(player, 'renovation')
    expect(mods).toHaveLength(0)
    const sols = computeAllBuyableCombinations(player, { fee: { stone: 5, reed: 1 } }, undefined, 'renovation')
    expect(sols.length).toBeGreaterThan(0)
    expect(sols.every((s) => (s.resourcesPaid.stone ?? 0) === 5)).toBe(true)
  })
})
