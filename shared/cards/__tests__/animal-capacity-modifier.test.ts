import { installOfficialCardRegistry } from './card-environment'

installOfficialCardRegistry()

import { describe, expect, it } from 'vitest'
import { computeAnimalZones, getTotalAnimalCapacity } from '../../domain/animal-zones'
import type { PlayerState, Pasture } from '../../contract/types'
import { withActiveRegistry } from '../active-registry'
import { CardRegistry } from '../registry'

import '../A/A012_DrinkingTrough'
import '../B/B072_LoveforAgriculture'
import '../D/D011_LawnFertilizer'
import '../E/E033_BeaverColony'

const createPlayer = (overrides?: Partial<PlayerState>): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [{ row: 1, col: 0 }, { row: 2, col: 0 }], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimals: {}, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
    ...overrides,
  }) as PlayerState

const pastureTiles = {
  p1: [{ row: 1, col: 2 }, { row: 1, col: 3 }],
  p2: [{ row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 }],
  p3: [{ row: 0, col: 2 }, { row: 0, col: 3 }],
}
const makePasture = (id: keyof typeof pastureTiles, size: number): Pasture =>
  ({ id, tiles: pastureTiles[id].slice(0, size), animalType: null, animalCount: 0 })

describe('computeAnimalZones', () => {
  it('returns base zones without cards', () => {
    const player = createPlayer({
      pastures: [makePasture('p1', 2), makePasture('p2', 1)],
      stableTiles: [{ row: 2, col: 2 }],
    })
    const zones = computeAnimalZones(player)
    expect(zones.length).toBe(4)
    expect(zones[0]).toMatchObject({ id: 'p1', zoneType: 'pasture', capacity: 4 })
    expect(zones[1]).toMatchObject({ id: 'p2', zoneType: 'pasture', capacity: 4 })
    expect(zones[2]).toMatchObject({ id: 'house:1-0', zoneType: 'house', capacity: 1, occupiedZoneLimit: 1 })
    expect(zones[3]).toMatchObject({ id: 'house:2-0', zoneType: 'house', capacity: 1, occupiedZoneLimit: 1 })
  })

  it('includes loose stables', () => {
    const player = createPlayer({
      stableTiles: [{ row: 0, col: 0 }],
    })
    const zones = computeAnimalZones(player)
    expect(zones.length).toBe(3)
    expect(zones[2]).toMatchObject({ zoneType: 'stable', capacity: 1 })
  })

  it('keeps E033_BeaverColony stabled-pasture capacity', () => {
    const player = createPlayer({
      minorPlayed: ['E033_BeaverColony'],
      pastures: [makePasture('p1', 2), makePasture('p2', 3)],
      stableTiles: [{ row: 1, col: 2 }],
    })
    const zones = computeAnimalZones(player)
    expect(zones.find((z) => z.id === 'p1')!.capacity).toBe(8)
    expect(zones.find((z) => z.id === 'p1')!.requiredEmptyZoneGroupIds).toHaveLength(1)
    expect(zones.find((z) => z.id === 'p2')!.capacity).toBe(6)
    expect(zones.find((z) => z.id === 'p2')!.requiredEmptyZoneGroupIds).toBeUndefined()
  })

  it('combines the E33 constraint with A12 capacity regardless of card order', () => {
    const cardOrders = [
      ['E033_BeaverColony', 'A012_DrinkingTrough'],
      ['A012_DrinkingTrough', 'E033_BeaverColony'],
    ] as const

    for (const minorPlayed of cardOrders) {
      const player = createPlayer({
        minorPlayed: [...minorPlayed],
        pastures: [makePasture('p1', 2), makePasture('p2', 3)],
        stableTiles: [{ row: 1, col: 2 }],
      })
      const zones = computeAnimalZones(player)
      expect(zones.find((z) => z.id === 'p1')!.capacity).toBe(10)
      expect(zones.find((z) => z.id === 'p1')!.requiredEmptyZoneGroupIds).toHaveLength(1)
      expect(zones.find((z) => z.id === 'p2')!.capacity).toBe(8)
    }
  })

  it('sums zone capacities in getTotalAnimalCapacity', () => {
    const player = createPlayer({
      pastures: [makePasture('p1', 2)],
    })
    expect(getTotalAnimalCapacity(player)).toBe(5)
  })
})

describe('A012_DrinkingTrough', () => {
  it('adds +2 capacity to each pasture zone', () => {
    const player = createPlayer({
      minorPlayed: ['A012_DrinkingTrough'],
      pastures: [makePasture('p1', 2), makePasture('p2', 1)],
      stableTiles: [{ row: 2, col: 2 }],
    })
    const zones = computeAnimalZones(player)
    expect(zones.find((z) => z.id === 'p1')!.capacity).toBe(6)
    expect(zones.find((z) => z.id === 'p2')!.capacity).toBe(6)
  })

  it('does not affect house zone', () => {
    const player = createPlayer({
      minorPlayed: ['A012_DrinkingTrough'],
      pastures: [makePasture('p1', 1)],
    })
    const zones = computeAnimalZones(player)
    expect(zones.find((z) => z.zoneType === 'house')!.capacity).toBe(1)
  })

  it('does not affect stable zones', () => {
    const player = createPlayer({
      minorPlayed: ['A012_DrinkingTrough'],
      stableTiles: [{ row: 0, col: 0 }],
    })
    const zones = computeAnimalZones(player)
    const stableZone = zones.find((z) => z.zoneType === 'stable')
    expect(stableZone!.capacity).toBe(1)
  })

  it('increases getTotalAnimalCapacity', () => {
    const player = createPlayer({
      minorPlayed: ['A012_DrinkingTrough'],
      pastures: [makePasture('p1', 2), makePasture('p2', 1)],
    })
    expect(getTotalAnimalCapacity(player)).toBe(11)
  })

  it('does not trigger without card played', () => {
    const player = createPlayer({
      pastures: [makePasture('p1', 2)],
    })
    const zones = computeAnimalZones(player)
    expect(zones.find((z) => z.id === 'p1')!.capacity).toBe(4)
  })
})

describe('pasture capacity modifiers', () => {
  it('applies D11 replacement to size-one pastures only', () => {
    const player = createPlayer({
      minorPlayed: ['D011_LawnFertilizer'],
      pastures: [makePasture('p1', 1), makePasture('p2', 1), makePasture('p3', 2)],
      stableTiles: [{ row: 2, col: 2 }],
    })
    const zones = computeAnimalZones(player)
    expect(zones.find((z) => z.id === 'p1')!.capacity).toBe(3)
    expect(zones.find((z) => z.id === 'p2')!.capacity).toBe(6)
    expect(zones.find((z) => z.id === 'p3')!.capacity).toBe(4)
  })

  it('applies A12 additive pasture capacity without changing non-pasture zones', () => {
    const player = createPlayer({
      minorPlayed: ['A012_DrinkingTrough'],
      pastures: [makePasture('p1', 1)],
      stableTiles: [{ row: 0, col: 0 }],
    })
    const zones = computeAnimalZones(player)
    expect(zones.find((z) => z.id === 'p1')!.capacity).toBe(4)
    expect(zones.find((z) => z.zoneType === 'house')!.capacity).toBe(1)
    expect(zones.find((z) => z.zoneType === 'stable')!.capacity).toBe(1)
  })

  it('applies replacement before additive pasture capacity modifiers', () => {
    const player = createPlayer({
      minorPlayed: ['D011_LawnFertilizer', 'A012_DrinkingTrough'],
      pastures: [makePasture('p1', 1)],
    })
    const zones = computeAnimalZones(player)
    expect(zones.find((z) => z.id === 'p1')!.capacity).toBe(5)
  })

  it('keeps replacement before additive modifiers even when additive cards were played first', () => {
    const player = createPlayer({
      minorPlayed: ['B072_LoveforAgriculture', 'D011_LawnFertilizer', 'A012_DrinkingTrough'],
      pastures: [makePasture('p1', 1)],
      cardStates: {
        B072_LoveforAgriculture: {
          extraData: {
            pastureCrops: [{
              pastureId: 'p1',
              tiles: [],
              crop: 'grain',
              remaining: 3,
            }],
          },
        },
      },
    })
    const zones = computeAnimalZones(player)
    expect(zones.find((z) => z.id === 'p1')!.capacity).toBe(4)
  })

  it('applies same-kind pasture capacity modifiers in played order', () => {
    const registry = new CardRegistry()
    registry.registerEffects([
      {
        id: 'TEST_ReplaceThree',
        computePastureCapacityModifiers: () => [{
          sourceCard: 'TEST_ReplaceThree',
          kind: 'replacement',
          apply: () => 3,
        }],
      },
      {
        id: 'TEST_ReplaceSeven',
        computePastureCapacityModifiers: () => [{
          sourceCard: 'TEST_ReplaceSeven',
          kind: 'replacement',
          apply: () => 7,
        }],
      },
    ])

    const firstOrder = createPlayer({
      minorPlayed: ['TEST_ReplaceThree', 'TEST_ReplaceSeven'],
      pastures: [makePasture('p1', 1)],
    })
    const secondOrder = createPlayer({
      minorPlayed: ['TEST_ReplaceSeven', 'TEST_ReplaceThree'],
      pastures: [makePasture('p1', 1)],
    })

    expect(withActiveRegistry(
      registry,
      () => computeAnimalZones(firstOrder).find((z) => z.id === 'p1')!.capacity,
    )).toBe(7)
    expect(withActiveRegistry(
      registry,
      () => computeAnimalZones(secondOrder).find((z) => z.id === 'p1')!.capacity,
    )).toBe(3)
  })
})
