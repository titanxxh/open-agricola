import { describe, expect, it } from 'vitest'

import type { PlayerState } from '../../../game/types'
import { canRenovate, getRenovation, renovateHouse } from '../renovation'

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
  familySize: 2,
  workersAvailable: 2,
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
  occupationPlayed: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  newbornCount: 0,
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

  it('returns the stone-direct plan when skipClayTier is set on a wood house', () => {
    const player = createPlayer({ rooms: 3 })

    expect(getRenovation(player, { skipClayTier: true })).toEqual({
      nextType: 'stone',
      cost: { stone: 3, reed: 1 },
    })
  })

  it('ignores skipClayTier on a clay house and returns the standard stone plan', () => {
    const player = createPlayer({ houseType: 'clay', rooms: 2 })

    expect(getRenovation(player, { skipClayTier: true })).toEqual({
      nextType: 'stone',
      cost: { stone: 2, reed: 1 },
    })
  })

  it('renovates a wood house directly to stone when skipClayTier is set', () => {
    const player = createPlayer({
      rooms: 2,
      resources: { stone: 2, reed: 1 },
    })

    expect(canRenovate(player, undefined, getRenovation(player, { skipClayTier: true }))).toBe(true)
    expect(renovateHouse(player, undefined, getRenovation(player, { skipClayTier: true }))).toBe(true)
    expect(player.houseType).toBe('stone')
    expect(player.resources.stone).toBe(0)
    expect(player.resources.reed).toBe(0)
  })

  it('keeps the standard wood-to-clay path when no params are supplied', () => {
    const player = createPlayer({ rooms: 2 })

    expect(getRenovation(player)).toEqual({
      nextType: 'clay',
      cost: { clay: 2, reed: 1 },
    })
  })
})
