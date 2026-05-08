import { describe, it, expect, afterEach } from 'vitest'
import { computeInvalidAnimalsForZone, enforceAnimalCapacity, type AnimalZone } from '../../domain/animal-zones'
import { getActiveCardRegistry } from '../../cards/active-registry'
import type { PlayerState, GameState } from '../../contract/types'

const TEST_CARD = '__TEST_zoneCard__'

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    workers: [],
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    pastures: [],
    fields: [],
    fences: [],
    palisades: [],
    rooms: [],
    stableTiles: [],
    stableAnimals: {},
    houseType: 'wood',
    houseAnimalType: null,
    houseAnimalCount: 0,
    minorHand: [],
    minorPlayed: [],
    occupationHand: [],
    occupationPlayed: [],
    improvements: [],
    cardStates: {},
    startPlayer: false,
    placedFarmers: 0,
    ...overrides,
  } as unknown as PlayerState)

afterEach(() => {
  getActiveCardRegistry()?.removeEffectsWhere((id) => id === TEST_CARD)
})

describe('getInvalidAnimals hook', () => {
  it('reports invalid meeples returned by a card-zone hook (per-card validation)', () => {
    const reg = getActiveCardRegistry()
    if (!reg) throw new Error('no active registry')

    reg.setEffect({
      id: TEST_CARD,
      onComputeAnimalZones: (_player, _zones) => [
        {
          id: `card:${TEST_CARD}`,
          zoneType: 'card',
          capacity: 3,
          cardId: TEST_CARD,
          animalType: 'sheep',
          animalCount: 3,
        } as AnimalZone,
      ],
      // BGA-shape per-card validation: keep at most 1 meeple regardless of cap.
      getInvalidAnimals: (_player, _zone, meeples, _state) =>
        meeples.slice(1),
    })

    const player = makePlayer({ minorPlayed: [TEST_CARD] })
    const state = {} as GameState

    const zone: AnimalZone = {
      id: `card:${TEST_CARD}`,
      zoneType: 'card',
      capacity: 3,
      cardId: TEST_CARD,
      animalType: 'sheep',
      animalCount: 3,
    }
    const invalid = computeInvalidAnimalsForZone(state, player, zone)
    expect(invalid).toHaveLength(2)
    expect(invalid.every((m) => m.type === 'sheep')).toBe(true)
  })

  it('returns empty array when card has no getInvalidAnimals hook', () => {
    const reg = getActiveCardRegistry()
    if (!reg) throw new Error('no active registry')

    reg.setEffect({
      id: TEST_CARD,
      onComputeAnimalZones: (_p, _z) => [
        {
          id: `card:${TEST_CARD}`,
          zoneType: 'card',
          capacity: 5,
          cardId: TEST_CARD,
        } as AnimalZone,
      ],
    })

    const player = makePlayer({ minorPlayed: [TEST_CARD] })
    const state = {} as GameState
    const zone: AnimalZone = {
      id: `card:${TEST_CARD}`,
      zoneType: 'card',
      capacity: 5,
      cardId: TEST_CARD,
      animalType: 'cattle',
      animalCount: 5,
    }
    const invalid = computeInvalidAnimalsForZone(state, player, zone)
    expect(invalid).toEqual([])
  })

  it('enforceAnimalCapacity preserves resources when no card-zone hook is registered', () => {
    // Sanity: verify the existing path still runs without throwing when card
    // zones are present but no getInvalidAnimals hook is set. Concrete per-
    // card consumption of the hook is exercised by F-zone card tests.
    const reg = getActiveCardRegistry()
    if (!reg) throw new Error('no active registry')

    reg.setEffect({
      id: TEST_CARD,
      onComputeAnimalZones: (_p, _z) => [
        {
          id: `card:${TEST_CARD}`,
          zoneType: 'card',
          capacity: 3,
          cardId: TEST_CARD,
        } as AnimalZone,
      ],
      // No getInvalidAnimals — fallback path.
    })

    const player = makePlayer({
      minorPlayed: [TEST_CARD],
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      },
    })

    enforceAnimalCapacity(player)
    expect(player.resources.sheep).toBe(0)
  })

  it('enforceAnimalCapacity invokes getInvalidAnimals hook for each registered card zone', () => {
    const reg = getActiveCardRegistry()
    if (!reg) throw new Error('no active registry')

    let hookCalls = 0
    reg.setEffect({
      id: TEST_CARD,
      onComputeAnimalZones: (_p, _z) => [
        {
          id: `card:${TEST_CARD}`,
          zoneType: 'card',
          capacity: 2,
          cardId: TEST_CARD,
        } as AnimalZone,
      ],
      getInvalidAnimals: (_player, _zone, _meeples, _state) => {
        hookCalls += 1
        return []
      },
    })

    const player = makePlayer({ minorPlayed: [TEST_CARD] })
    enforceAnimalCapacity(player)
    expect(hookCalls).toBeGreaterThanOrEqual(1)
  })
})
