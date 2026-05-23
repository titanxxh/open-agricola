import { describe, expect, it } from 'vitest'
import type {
  ActionAvailabilityContext,
  ActionExecutionContext,
  ActionExecutionResult,
  ComplexCost,
  InternalActionChild,
  PlayerState,
  Resource,
} from '../../shared/contract/types'
import {
  buildRenovationPlan,
  renovateHouseAction,
} from '../../shared/actions/effects/renovation'

// Reference card files for awareness of where each cost-override originates.
// The matrix asserts the post-spec ComplexCost shape (unitFee + nb + fees[0])
// produced by buildRenovationPlan composed with mergeRenovationCost via
// resolveChoice — independent of card listener wiring.

const createPlayer = (
  overrides: Partial<PlayerState> = {},
): PlayerState => ({
  id: 'p1',
  name: 'PlayerA',
  color: 'red',
  resources: {
    wood: 99, clay: 99, reed: 99, stone: 99, food: 99,
    grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    ...(overrides.resources ?? {}),
  },
  workers: [],
  rooms: 3,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  cardStates: {},
  ...overrides,
}) as PlayerState

const buildContext = (
  player: PlayerState,
  params: Record<string, unknown>,
  costs?: Partial<Resource>,
): ActionExecutionContext & ActionAvailabilityContext => ({
  state: { players: [player] } as never,
  player,
  space: { id: 'renovate-house' } as never,
  params,
  costs,
})

const extractPayChild = (result: ActionExecutionResult): InternalActionChild => {
  if (result.type !== 'ok') throw new Error('expected ok result')
  const pay = result.internalChildren?.beforeHostListeners?.[0]
  if (!pay || pay.actionId !== 'pay') throw new Error('expected pay child')
  return pay
}

const extractPayCost = (result: ActionExecutionResult): ComplexCost => {
  return extractPayChild(result).params!.cost as ComplexCost
}

const totalOf = (cost: ComplexCost): Partial<Resource> => {
  const out: Partial<Resource> = {}
  const fee0 = cost.fees?.[0] ?? {}
  for (const [k, v] of Object.entries(fee0)) {
    out[k as keyof Resource] = (out[k as keyof Resource] ?? 0) + (v ?? 0)
  }
  const nb = cost.nb ?? 0
  for (const [k, v] of Object.entries(cost.unitFee ?? {})) {
    out[k as keyof Resource] = (out[k as keyof Resource] ?? 0) + (v ?? 0) * nb
  }
  return out
}

describe('renovation computeCosts matrix', () => {
  it('D121_ClayPlasterer wood→clay 3 rooms — total = 1 clay + 1 reed', () => {
    // D121 hook: { clay: -(rooms - 1) } = { clay: -2 }
    const player = createPlayer({ rooms: 3, houseType: 'wood' })
    const plan = buildRenovationPlan(player, 'clay')!
    expect(plan.cost.unitFee).toEqual({ clay: 1 })
    expect(plan.cost.nb).toBe(3)

    const ctx = buildContext(player, { selectedOption: 'clay' }, { clay: -2 })
    const result = renovateHouseAction.resolveChoice!(ctx, 'clay')
    const pay = extractPayChild(result)
    expect(pay).toMatchObject({
      actionId: 'pay',
      params: {
        costType: 'renovation',
        optionPrefix: 'renovation',
      },
      resultKey: 'payment',
    })
    const cost = extractPayCost(result)
    expect(cost.fees).toEqual([{ reed: 1, clay: -2 }])
    expect(totalOf(cost)).toEqual({ reed: 1, clay: 1 })
  })

  it('D154_ChimneySweep clay→stone 3 rooms — total = 1 stone + 1 reed', () => {
    // D154 hook: { stone: -2 } per-action
    const player = createPlayer({ rooms: 3, houseType: 'clay' })
    const plan = buildRenovationPlan(player, 'stone')!
    expect(plan.cost.unitFee).toEqual({ stone: 1 })
    expect(plan.cost.nb).toBe(3)

    const ctx = buildContext(player, { selectedOption: 'stone' }, { stone: -2 })
    const result = renovateHouseAction.resolveChoice!(ctx, 'stone')
    const cost = extractPayCost(result)
    expect(cost.fees).toEqual([{ reed: 1, stone: -2 }])
    expect(totalOf(cost)).toEqual({ reed: 1, stone: 1 })
  })

  it('D81_RoofLadder wood→clay 3 rooms — total = 3 clay (reed waived)', () => {
    // D81 hook: { reed: -1 } per-action
    const player = createPlayer({ rooms: 3, houseType: 'wood' })
    const ctx = buildContext(player, { selectedOption: 'clay' }, { reed: -1 })
    const result = renovateHouseAction.resolveChoice!(ctx, 'clay')
    const cost = extractPayCost(result)
    expect(cost.fees).toEqual([{ reed: 0 }])
    expect(totalOf(cost)).toEqual({ reed: 0, clay: 3 })
  })

  it('D13_Trowel wood→stone 3 rooms — total = 3 stone + 3 reed + 3 food', () => {
    // D13 hook for wood→stone: { food: rooms, reed: rooms - 1 } = { food: 3, reed: 2 }
    const player = createPlayer({ rooms: 3, houseType: 'wood' })
    const ctx = buildContext(player, { selectedOption: 'stone' }, { food: 3, reed: 2 })
    const result = renovateHouseAction.resolveChoice!(ctx, 'stone')
    const cost = extractPayCost(result)
    expect(cost.fees).toEqual([{ reed: 3, food: 3 }])
    expect(totalOf(cost)).toEqual({ stone: 3, reed: 3, food: 3 })
  })

  it('B128_Plumber wood→clay 3 rooms — total = 1 clay + 1 reed', () => {
    // B128 hook (clay target): { clay: -2 } per-action; same shape as D121
    const player = createPlayer({ rooms: 3, houseType: 'wood' })
    const ctx = buildContext(player, { selectedOption: 'clay' }, { clay: -2 })
    const result = renovateHouseAction.resolveChoice!(ctx, 'clay')
    const cost = extractPayCost(result)
    expect(totalOf(cost)).toEqual({ reed: 1, clay: 1 })
  })

  it('B128_Plumber clay→stone 3 rooms — total = 1 stone + 1 reed', () => {
    const player = createPlayer({ rooms: 3, houseType: 'clay' })
    const ctx = buildContext(player, { selectedOption: 'stone' }, { stone: -2 })
    const result = renovateHouseAction.resolveChoice!(ctx, 'stone')
    const cost = extractPayCost(result)
    expect(totalOf(cost)).toEqual({ reed: 1, stone: 1 })
  })

  it.skip('E27_PiggyBank does not target renovation', () => {
    // E27 hook only attaches to `improvement` actions. Listed in spec §6.2
    // verification deliverable for completeness; no renovation matrix case.
  })

  // Edge: nb=1 and nb=2 sanity for D121 path
  it('D121 nb=1 wood→clay — total = 1 clay + 1 reed (override clamps clay to 0 net)', () => {
    const player = createPlayer({ rooms: 1, houseType: 'wood' })
    const plan = buildRenovationPlan(player, 'clay')!
    expect(plan.cost.nb).toBe(1)
    // override = { clay: -(rooms-1) } = { clay: 0 } => merge applied but value 0
    const ctx = buildContext(player, { selectedOption: 'clay' }, { clay: 0 })
    const result = renovateHouseAction.resolveChoice!(ctx, 'clay')
    const cost = extractPayCost(result)
    expect(totalOf(cost)).toEqual({ reed: 1, clay: 1 })
  })

  it('D121 nb=2 wood→clay — total = 1 clay + 1 reed', () => {
    const player = createPlayer({ rooms: 2, houseType: 'wood' })
    const ctx = buildContext(player, { selectedOption: 'clay' }, { clay: -1 })
    const result = renovateHouseAction.resolveChoice!(ctx, 'clay')
    const cost = extractPayCost(result)
    expect(totalOf(cost)).toEqual({ reed: 1, clay: 1 })
  })
})
