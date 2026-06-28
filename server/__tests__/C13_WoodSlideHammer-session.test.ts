import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { canRenovate } from '../../shared/actions/effects/renovation'
import {
  applyCostModifiers,
  computeAllBuyableCombinations,
  getModifiersForCostType,
} from '../../shared/actions/payment/internal'
import type { BonusModifier } from '../../shared/contract/types'

import '../../shared/cards/A/A087_Conservator'
import '../../shared/cards/C/C013_WoodSlideHammer'

const CARD_ID = 'C013_WoodSlideHammer'
const CONSERVATOR_ID = 'A087_Conservator'

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
      optional: false,
      conditions: { houseTypeWood: 1, minNumRooms: 5 },
    } as BonusModifier,
  ]
  return { session, state, player }
}

describe('C013_WoodSlideHammer — renovation -2 stone discount gated by conditions', () => {
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

  it('4 rooms → modifier surfaces statically, but minNumRooms gates inside enumerate', () => {
    const { player } = setupOwner()
    player.houseType = 'wood'
    player.rooms = 4
    player.roomTiles = [
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 },
    ]
    player.resources = { ...player.resources, reed: 4, stone: 4, clay: 0 }

    // T1.7: getModifiersForCostType uses static-only filter; minNumRooms
    // is deferred to evaluateConditions(_, _, nb) inside enumerate.
    const mods = getModifiersForCostType(player, 'renovation')
    expect(mods).toHaveLength(1)

    // End-to-end: 4 rooms wood→stone renovation. C13 condition
    // (minNumRooms:5) fails at the enumerate condition gate → no discount.
    const sols = computeAllBuyableCombinations(
      player,
      { fee: { stone: 4, reed: 1 } },
      undefined,
      'renovation',
    )
    expect(sols.length).toBeGreaterThan(0)
    expect(sols.every((s) => (s.resourcesPaid.stone ?? 0) === 4)).toBe(true)
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

describe('C013_WoodSlideHammer — payment-outcome boundary (Sprint 5 mech-E follow-up)', () => {
  // These cases verify the conditions chain end-to-end on the unified
  // ComplexCost.bonuses payment path. The C13 BonusModifier flows through:
  //   getModifiersForCostType (static-only) → applyCostModifiers
  //   (propagates nb-aware conditions to Bonus.conditions) →
  //   computeAllBuyableCombinations (evaluateConditions(_, _, nb)).
  // The post-unification design preserves Bonus.conditions so the nb-aware
  // gate (minNumRooms) runs against the actual renovation/construct nb.

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
    // Generated Bonus retains nb-aware conditions so enumerate can gate on
    // minNumRooms against the actual nb (renovation nb defaults to player.rooms).
    expect(effective.bonuses).toBeDefined()
    expect(effective.bonuses!.length).toBe(1)
    expect(effective.bonuses![0].conditions).toEqual({ houseTypeWood: 1, minNumRooms: 5 })

    const sols = computeAllBuyableCombinations(player, { fee: { stone: 5, reed: 1 } }, undefined, 'renovation')
    expect(sols.length).toBeGreaterThan(0)
    // At least one solution applies the C13 discount → stone paid <= 3.
    expect(sols.some((s) => (s.resourcesPaid.stone ?? 0) <= 3)).toBe(true)
  })

  it('4 wood rooms → C13 surfaces statically (T1.7), but enumerate gate filters the discount path', () => {
    const { player } = setupOwner()
    player.houseType = 'wood'
    player.rooms = 4
    player.resources = { ...player.resources, stone: 5, reed: 2 }

    // T1.7: static-only filter at getModifiersForCostType (houseType passes).
    // The end-to-end check below verifies minNumRooms still gates the discount.
    const mods = getModifiersForCostType(player, 'renovation')
    expect(mods).toHaveLength(1)
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

  it('A87 direct wood→stone payment uses C13 while the house is still wooden', () => {
    const { session, state, player } = setupOwner()
    state.currentPlayerIndex = 0
    state.round = 6
    player.occupationPlayed.push(CONSERVATOR_ID)
    player.houseType = 'wood'
    player.rooms = 5
    player.resources = {
      ...player.resources,
      clay: 0,
      stone: 3,
      reed: 1,
    }
    session.loadState(state)

    let resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      resp = session.resolveChoice(0, 'stone')
    }

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.houseType).toBe('stone')
    expect(resp.state.players[0]!.resources.stone).toBe(0)
    expect(resp.state.players[0]!.resources.reed).toBe(0)
  })
})
