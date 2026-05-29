import { describe, expect, it } from 'vitest'
import { computeAnimalZones, getTotalAnimalCapacity } from '../../domain/animal-zones'
import type { PlayerState, Pasture } from '../../contract/types'
import { withActiveRegistry } from '../active-registry'
import { CardRegistry } from '../registry'

import '../A/A12_DrinkingTrough'
import '../B/B72_LoveforAgriculture'
import '../D/D11_LawnFertilizer'
import '../E/E33_BeaverColony'

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
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
    ...overrides,
  }) as PlayerState

const makePasture = (id: string, size: number, stables = 0): Pasture =>
  ({ id, size, stables, tiles: [], animalType: null, animalCount: 0 }) as Pasture

describe('computeAnimalZones', () => {
  it('returns base zones without cards', () => {
    const player = createPlayer({
      pastures: [makePasture('p1', 2, 0), makePasture('p2', 1, 1)],
    })
    const zones = computeAnimalZones(player)
    expect(zones.length).toBe(3)
    expect(zones[0]).toMatchObject({ id: 'p1', zoneType: 'pasture', capacity: 4 })
    expect(zones[1]).toMatchObject({ id: 'p2', zoneType: 'pasture', capacity: 4 })
    expect(zones[2]).toMatchObject({ id: 'house', zoneType: 'house', capacity: 1 })
  })

  it('includes loose stables', () => {
    const player = createPlayer({
      stableTiles: [{ row: 0, col: 0 }] as any,
    })
    const zones = computeAnimalZones(player)
    expect(zones.length).toBe(2)
    expect(zones[1]).toMatchObject({ zoneType: 'stable', capacity: 1 })
  })

  it('respects E33_BeaverColony blocked pasture', () => {
    const player = createPlayer({
      minorPlayed: ['E33_BeaverColony'],
      pastures: [makePasture('p1', 2, 1), makePasture('p2', 3, 0)],
    })
    const zones = computeAnimalZones(player)
    expect(zones.find((z) => z.id === 'p1')!.capacity).toBe(0)
    expect(zones.find((z) => z.id === 'p2')!.capacity).toBe(6)
  })

  it('keeps the blocked pasture at 0 regardless of E33/A12 card order', () => {
    const cardOrders = [
      ['E33_BeaverColony', 'A12_DrinkingTrough'],
      ['A12_DrinkingTrough', 'E33_BeaverColony'],
    ] as const

    for (const minorPlayed of cardOrders) {
      const player = createPlayer({
        minorPlayed: [...minorPlayed],
        pastures: [makePasture('p1', 2, 1), makePasture('p2', 3, 0)],
      })
      const zones = computeAnimalZones(player)
      expect(zones.find((z) => z.id === 'p1')!.capacity).toBe(0)
      expect(zones.find((z) => z.id === 'p2')!.capacity).toBe(8)
    }
  })

  it('sums zone capacities in getTotalAnimalCapacity', () => {
    const player = createPlayer({
      pastures: [makePasture('p1', 2, 0)],
    })
    expect(getTotalAnimalCapacity(player)).toBe(5)
  })
})

describe('A12_DrinkingTrough', () => {
  it('adds +2 capacity to each pasture zone', () => {
    const player = createPlayer({
      minorPlayed: ['A12_DrinkingTrough'],
      pastures: [makePasture('p1', 2, 0), makePasture('p2', 1, 1)],
    })
    const zones = computeAnimalZones(player)
    expect(zones.find((z) => z.id === 'p1')!.capacity).toBe(6)
    expect(zones.find((z) => z.id === 'p2')!.capacity).toBe(6)
  })

  it('does not affect house zone', () => {
    const player = createPlayer({
      minorPlayed: ['A12_DrinkingTrough'],
      pastures: [makePasture('p1', 1, 0)],
    })
    const zones = computeAnimalZones(player)
    expect(zones.find((z) => z.zoneType === 'house')!.capacity).toBe(1)
  })

  it('does not affect stable zones', () => {
    const player = createPlayer({
      minorPlayed: ['A12_DrinkingTrough'],
      stableTiles: [{ row: 0, col: 0 }] as any,
    })
    const zones = computeAnimalZones(player)
    const stableZone = zones.find((z) => z.zoneType === 'stable')
    expect(stableZone!.capacity).toBe(1)
  })

  it('increases getTotalAnimalCapacity', () => {
    const player = createPlayer({
      minorPlayed: ['A12_DrinkingTrough'],
      pastures: [makePasture('p1', 2, 0), makePasture('p2', 1, 0)],
    })
    expect(getTotalAnimalCapacity(player)).toBe(11)
  })

  it('does not trigger without card played', () => {
    const player = createPlayer({
      pastures: [makePasture('p1', 2, 0)],
    })
    const zones = computeAnimalZones(player)
    expect(zones.find((z) => z.id === 'p1')!.capacity).toBe(4)
  })
})

describe('pasture capacity modifiers', () => {
  it('applies D11 replacement to size-one pastures only', () => {
    const player = createPlayer({
      minorPlayed: ['D11_LawnFertilizer'],
      pastures: [makePasture('p1', 1, 0), makePasture('p2', 1, 1), makePasture('p3', 2, 0)],
    })
    const zones = computeAnimalZones(player)
    expect(zones.find((z) => z.id === 'p1')!.capacity).toBe(3)
    expect(zones.find((z) => z.id === 'p2')!.capacity).toBe(6)
    expect(zones.find((z) => z.id === 'p3')!.capacity).toBe(4)
  })

  it('applies A12 additive pasture capacity without changing non-pasture zones', () => {
    const player = createPlayer({
      minorPlayed: ['A12_DrinkingTrough'],
      pastures: [makePasture('p1', 1, 0)],
      stableTiles: [{ row: 0, col: 0 }] as any,
    })
    const zones = computeAnimalZones(player)
    expect(zones.find((z) => z.id === 'p1')!.capacity).toBe(4)
    expect(zones.find((z) => z.id === 'house')!.capacity).toBe(1)
    expect(zones.find((z) => z.zoneType === 'stable')!.capacity).toBe(1)
  })

  it('applies replacement before additive pasture capacity modifiers', () => {
    const player = createPlayer({
      minorPlayed: ['D11_LawnFertilizer', 'A12_DrinkingTrough'],
      pastures: [makePasture('p1', 1, 0)],
    })
    const zones = computeAnimalZones(player)
    expect(zones.find((z) => z.id === 'p1')!.capacity).toBe(5)
  })

  it('keeps replacement before additive modifiers even when additive cards were played first', () => {
    const player = createPlayer({
      minorPlayed: ['B72_LoveforAgriculture', 'D11_LawnFertilizer', 'A12_DrinkingTrough'],
      pastures: [makePasture('p1', 1, 0)],
      cardStates: {
        B72_LoveforAgriculture: {
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
      pastures: [makePasture('p1', 1, 0)],
    })
    const secondOrder = createPlayer({
      minorPlayed: ['TEST_ReplaceSeven', 'TEST_ReplaceThree'],
      pastures: [makePasture('p1', 1, 0)],
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
