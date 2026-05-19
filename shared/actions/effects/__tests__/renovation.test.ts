import { describe, expect, it } from 'vitest'

import type { PlayerState } from '../../../contract/types'
import {
  buildRenovationPlan,
  canRenovate,
  getRenovation,
  renovateHouse,
  renovateHouseAction,
} from '../renovation'

const createPlayer = (
  overrides: Partial<PlayerState> = {},
): PlayerState => ({
  id: 'p1',
  name: 'PlayerA',
  color: 'red',
  resources: {
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
    ...(overrides.resources ?? {}),
  },
  workers: [
    { id: '1', isActive: true, isNewborn: false },
    { id: '2', isActive: true, isNewborn: false },
    { id: '3', isActive: false, isNewborn: false },
    { id: '4', isActive: false, isNewborn: false },
    { id: '5', isActive: false, isNewborn: false },
  ],
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  cardStates: {},
  ...overrides,
}) as PlayerState

describe('renovation', () => {
  it('uses one reed plus one clay per room for wood-to-clay renovation', () => {
    const player = createPlayer()

    expect(getRenovation(player)).toEqual({
      nextType: 'clay',
      cost: { clay: 2, reed: 1 },
    })
  })

  it('allows renovation with enough clay for each room and a single reed', () => {
    const player = createPlayer({
      resources: { clay: 2, reed: 1 },
    })

    expect(canRenovate(player)).toBe(true)
  })

  it('rejects renovation when the single reed fee cannot be paid', () => {
    const player = createPlayer({
      resources: { clay: 2, reed: 0 },
    })

    expect(canRenovate(player)).toBe(false)
  })

  it('spends one reed total when renovating multiple rooms', () => {
    const player = createPlayer({
      resources: { clay: 2, reed: 1 },
    })

    expect(renovateHouse(player)).toBe(true)
    expect(player.houseType).toBe('clay')
    expect(player.resources.clay).toBe(0)
    expect(player.resources.reed).toBe(0)
  })

  it('builds the wood-to-stone direct plan when target=stone is requested explicitly', () => {
    const player = createPlayer({ rooms: 3 })

    expect(buildRenovationPlan(player, 'stone')).toEqual({
      nextType: 'stone',
      cost: { stone: 3, reed: 1 },
    })
  })

  it('returns the standard clay-to-stone plan from buildRenovationPlan(target=stone)', () => {
    const player = createPlayer({ houseType: 'clay', rooms: 2 })

    expect(buildRenovationPlan(player, 'stone')).toEqual({
      nextType: 'stone',
      cost: { stone: 2, reed: 1 },
    })
  })

  it('returns null when buildRenovationPlan is asked for an illegal target', () => {
    const stoneHouse = createPlayer({ houseType: 'stone' })
    expect(buildRenovationPlan(stoneHouse, 'stone')).toBeNull()
    expect(buildRenovationPlan(stoneHouse, 'clay')).toBeNull()
    const clayHouse = createPlayer({ houseType: 'clay' })
    expect(buildRenovationPlan(clayHouse, 'clay')).toBeNull()
  })

  it('renovates a wood house directly to stone via buildRenovationPlan(target=stone)', () => {
    const player = createPlayer({
      rooms: 2,
      resources: { stone: 2, reed: 1 },
    })
    const stonePlan = buildRenovationPlan(player, 'stone')

    expect(canRenovate(player, undefined, stonePlan)).toBe(true)
    expect(renovateHouse(player, undefined, stonePlan)).toBe(true)
    expect(player.houseType).toBe('stone')
    expect(player.resources.stone).toBe(0)
    expect(player.resources.reed).toBe(0)
  })

  it('keeps the default plan from getRenovation(player) (no params)', () => {
    const player = createPlayer({ rooms: 2 })

    expect(getRenovation(player)).toEqual({
      nextType: 'clay',
      cost: { clay: 2, reed: 1 },
    })
  })
})

describe('renovateHouseAction (engine opt-in choice flow)', () => {
  const buildExecutionContext = (player: PlayerState, params?: Record<string, unknown>) => ({
    state: { players: [player] } as never,
    player,
    space: { id: 'renovate-house' } as never,
    params,
  })

  it('exposes a single base option matching the default next material', () => {
    const wood = createPlayer({ rooms: 2 })
    expect(renovateHouseAction.getBaseChoiceOptions?.(buildExecutionContext(wood))).toEqual([
      { value: 'clay', labelKey: 'ui.interactionRenovateToClay' },
    ])

    const clay = createPlayer({ houseType: 'clay', rooms: 2 })
    expect(renovateHouseAction.getBaseChoiceOptions?.(buildExecutionContext(clay))).toEqual([
      { value: 'stone', labelKey: 'ui.interactionRenovateToStone' },
    ])

    const stone = createPlayer({ houseType: 'stone', rooms: 2 })
    expect(renovateHouseAction.getBaseChoiceOptions?.(buildExecutionContext(stone))).toEqual([])
  })

  it('declares a choice prompt key and a renovation-fail log key', () => {
    expect(renovateHouseAction.choicePromptKey).toBe('ui.interactionChooseRenovationTarget')
    expect(renovateHouseAction.noChoiceLogKey).toBe('log.renovationFail')
  })

  it('execute() must never run directly — engine must use getBaseChoiceOptions/resolveChoice', () => {
    const player = createPlayer({ resources: { clay: 2, reed: 1 } })
    expect(renovateHouseAction.execute(buildExecutionContext(player))).toEqual({ type: 'fail', errorKey: 'log.renovationFail',
    })
  })

  it('resolveChoice("clay") returns a seq:[pay, apply-renovation] flow', () => {
    const player = createPlayer({ resources: { clay: 2, reed: 1 } })
    const result = renovateHouseAction.resolveChoice!(buildExecutionContext(player), 'clay')
    expect(result.type).toBe('flow')
    if (result.type !== 'flow') return
    const flow = result.flow as { type: 'seq'; children: Array<{ type: 'leaf'; actionId: string; params: Record<string, unknown> }> }
    expect(flow.type).toBe('seq')
    expect(flow.children).toHaveLength(2)
    expect(flow.children[0]!.actionId).toBe('pay')
    expect(flow.children[0]!.params.cost).toEqual({ fee: { clay: 2, reed: 1 } })
    expect(flow.children[0]!.params.costType).toBe('renovation')
    expect(flow.children[0]!.params.optionPrefix).toBe('pay:renovate:clay')
    expect(flow.children[1]!.actionId).toBe('apply-renovation')
    expect(flow.children[1]!.params).toEqual({ nextType: 'clay' })
    // resolveChoice itself does not mutate — engine drives pay then apply-renovation.
    expect(player.houseType).toBe('wood')
    expect(player.resources.clay).toBe(2)
  })

  it('resolveChoice("stone") returns a flow targeting stone (Conservator path)', () => {
    const player = createPlayer({ resources: { stone: 2, reed: 1 } })
    const result = renovateHouseAction.resolveChoice!(buildExecutionContext(player), 'stone')
    expect(result.type).toBe('flow')
    if (result.type !== 'flow') return
    const flow = result.flow as { type: 'seq'; children: Array<{ type: 'leaf'; actionId: string; params: Record<string, unknown> }> }
    expect(flow.children[0]!.params.cost).toEqual({ fee: { stone: 2, reed: 1 } })
    expect(flow.children[0]!.params.optionPrefix).toBe('pay:renovate:stone')
    expect(flow.children[1]!.params).toEqual({ nextType: 'stone' })
    expect(player.houseType).toBe('wood')
  })

  it('resolveChoice fails when the chosen target is illegal for the current house', () => {
    const stone = createPlayer({ houseType: 'stone' })
    expect(renovateHouseAction.resolveChoice!(buildExecutionContext(stone), 'stone')).toEqual({ type: 'fail', errorKey: 'log.renovationFail',
    })
  })
})
