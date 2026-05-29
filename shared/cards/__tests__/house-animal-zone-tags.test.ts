import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../contract/types'
import { computeAnimalZones, isHouseAnimalZone } from '../../domain/animal-zones'
import { playerHasCardCapability } from '../helpers/card-type'
import { CardRegistry } from '../registry'
import { withActiveRegistry } from '../active-registry'
import { D148_DomesticianExpert_impl } from '../D/D148_DomesticianExpert'
import { D164_PetGrower_impl } from '../D/D164_PetGrower'

const createPlayer = (overrides: Partial<PlayerState> = {}): PlayerState =>
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
    fields: [], fences: 0,
    roomTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
    ...overrides,
  }) as PlayerState

const createState = (player: PlayerState): GameState =>
  ({ players: [player], completedFeedingPhases: 0 } as GameState)

describe('house animal zone tags', () => {
  it('marks the normal house zone as a house animal zone', () => {
    const player = createPlayer()
    const house = computeAnimalZones(player, createState(player)).find((z) => z.id === 'house')

    expect(house).toMatchObject({ zoneType: 'house', houseAnimalZone: true })
    expect(isHouseAnimalZone(house!)).toBe(true)
  })

  it('marks D148 house-edge zone as a house animal zone', () => {
    const player = createPlayer({
      occupationPlayed: ['D148_DomesticianExpert'],
    })
    const zone = computeAnimalZones(player, createState(player)).find(
      (z) => z.id === 'card:D148_DomesticianExpert',
    )

    expect(zone).toMatchObject({
      zoneType: 'card',
      cardId: 'D148_DomesticianExpert',
      capacity: 2,
      houseAnimalZone: true,
    })
    expect(isHouseAnimalZone(zone!)).toBe(true)
  })

  it('filters normal and tagged house animal zones through D12 capability metadata', () => {
    const player = createPlayer({
      minorPlayed: ['D12_MilkingPlace'],
      occupationPlayed: ['D148_DomesticianExpert'],
    })
    const registry = new CardRegistry()
    registry.loadImpl('D148_DomesticianExpert', D148_DomesticianExpert_impl)

    const zones = withActiveRegistry(registry, () => computeAnimalZones(player, createState(player)))

    expect(playerHasCardCapability(player, 'blocksHouseAnimalZones')).toBe(true)
    expect(zones.some(isHouseAnimalZone)).toBe(false)
    expect(zones.some((z) => z.id === 'house')).toBe(false)
    expect(zones.some((z) => z.id === 'card:D148_DomesticianExpert')).toBe(false)
  })

  it('counts tagged house animal zones for D164 Pet Grower', () => {
    const player = createPlayer({
      occupationPlayed: ['D148_DomesticianExpert', 'D164_PetGrower'],
      cardStates: {
        D148_DomesticianExpert: {
          extraData: { held: 1, animalType: 'sheep' },
        },
      },
    })
    const result = D164_PetGrower_impl.listeners![0]!.handler({
      state: createState(player),
      player,
      space: { id: 'sheep-market' },
    } as never)

    expect(result).toBeUndefined()
  })
})
