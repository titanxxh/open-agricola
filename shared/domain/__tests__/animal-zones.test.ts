import { afterEach, describe, it, expect } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session.ts'
import type { GameState, PlayerState } from '../../contract/types.ts'
import { getActiveCardRegistry } from '../../cards/active-registry.ts'
import {
  buildCardAnimalZoneId,
  canAccommodateAllAnimals,
  canAccommodateAnimalTotals,
  computeAnimalZones,
  type AnimalZone,
} from '../animal-zones.ts'
import { applyAnimalPayment } from '../animal-payment.ts'
import { getAssignedAnimalsByType } from '../animals.ts'
import { playerBoard } from '../index.ts'

const TEST_CARD = '__TEST_accommodation_zone__'

const playerWithPasture = (overrides: Partial<PlayerState> = {}): PlayerState => {
  const session = new GameSession()
  const state = session.getState().state
  const player = state.players[0]
  player.pastures = [
    {
      id: 'p1',
      size: 1,
      tiles: [{ row: 0, col: 0 }],
      stables: 0,
      animalType: null,
      animalCount: 0,
    },
  ]
  Object.assign(player, overrides)
  return player
}

afterEach(() => {
  getActiveCardRegistry()?.removeEffectsWhere((id) => id === TEST_CARD)
})

describe('AnimalZones', () => {
  it('checks final totals against ordinary single-type pasture rules', () => {
    const state = { players: [] } as unknown as GameState
    const player = playerWithPasture({ minorPlayed: ['D012_MilkingPlace'] })

    expect(canAccommodateAnimalTotals(state, player, { sheep: 2 })).toBe(true)
    expect(canAccommodateAnimalTotals(state, player, { sheep: 1, boar: 1 })).toBe(false)
  })

  it('checks add-only animals against final totals', () => {
    const state = { players: [] } as unknown as GameState
    const session = new GameSession()
    const player = session.getState().state.players[0]

    expect(canAccommodateAllAnimals(state, player, ['sheep'])).toBe(true)
    expect(canAccommodateAllAnimals(state, player, ['sheep', 'boar'])).toBe(false)
  })

  it('counts M084 lying horses against their visible animal space', () => {
    const state = { players: [], enableFarmersOfTheMoor: true } as unknown as GameState
    const player = playerWithPasture({
      pastures: [],
      houseAnimalType: 'horse',
      houseAnimalCount: 1,
      minorPlayed: ['M084_BogPony'],
      cardStates: {
        M084_BogPony: {
          extraData: { lyingHorseCount: 1 },
        },
      } as never,
    })
    player.resources.horse = 1

    expect(canAccommodateAllAnimals(state, player, ['sheep'])).toBe(false)
    expect(canAccommodateAnimalTotals(state, player, { horse: 1, sheep: 1 })).toBe(false)
  })

  it('allows mixed animals only in explicitly mixed card zones', () => {
    const reg = getActiveCardRegistry()
    if (!reg) throw new Error('no active registry')
    reg.setEffect({
      id: TEST_CARD,
      onComputeAnimalZones: () => [
        {
          id: `card:${TEST_CARD}`,
          zoneType: 'card',
          capacity: 2,
          cardId: TEST_CARD,
          allowedAnimalType: null,
        } as AnimalZone,
      ],
    })
    const state = { players: [] } as unknown as GameState
    const player = playerWithPasture({ minorPlayed: ['D012_MilkingPlace', TEST_CARD], pastures: [] })

    expect(canAccommodateAnimalTotals(state, player, { sheep: 1, boar: 1 })).toBe(true)
  })

  it('preserves fixed animal type on card zones when checking final totals', () => {
    const reg = getActiveCardRegistry()
    if (!reg) throw new Error('no active registry')
    reg.setEffect({
      id: TEST_CARD,
      onComputeAnimalZones: () => [
        {
          id: `card:${TEST_CARD}`,
          zoneType: 'card',
          capacity: 2,
          animalType: 'sheep',
          animalCount: 0,
          allowedAnimalType: 'sheep',
        } as AnimalZone,
      ],
    })
    const state = { players: [] } as unknown as GameState
    const player = playerWithPasture({ occupationPlayed: [TEST_CARD], minorPlayed: ['D012_MilkingPlace'], pastures: [] })

    expect(canAccommodateAnimalTotals(state, player, { sheep: 2 })).toBe(true)
    expect(canAccommodateAnimalTotals(state, player, { boar: 1 })).toBe(false)
  })

  it('does not freeze flexible card zones to their current animal type', () => {
    const reg = getActiveCardRegistry()
    if (!reg) throw new Error('no active registry')
    reg.setEffect({
      id: TEST_CARD,
      onComputeAnimalZones: () => [
        {
          id: `card:${TEST_CARD}`,
          zoneType: 'card',
          capacity: 3,
          animalType: null,
          animalCount: 0,
        } as AnimalZone,
      ],
    })
    const state = { players: [] } as unknown as GameState
    const player = playerWithPasture({
      occupationPlayed: [TEST_CARD],
      minorPlayed: ['D012_MilkingPlace'],
      pastures: [],
      cardStates: {
        [TEST_CARD]: {
          extraData: {
            animalCounts: { sheep: 3 },
          },
        },
      },
    })
    player.resources.sheep = 3

    expect(canAccommodateAnimalTotals(state, player, { boar: 3 })).toBe(true)
  })

  it('attaches the source card id to card zones added by a card effect', () => {
    const reg = getActiveCardRegistry()
    if (!reg) throw new Error('no active registry')
    reg.setEffect({
      id: TEST_CARD,
      onComputeAnimalZones: (_player, zones) => {
        zones.push({
          id: `card:${TEST_CARD}`,
          zoneType: 'card',
          capacity: 1,
          animalType: 'sheep',
          animalCount: 0,
        } as AnimalZone)
      },
    })
    const state = { players: [] } as unknown as GameState
    const player = playerWithPasture({ occupationPlayed: [TEST_CARD] })
    const cardZone = computeAnimalZones(player, state).find((zone) => zone.id === `card:${TEST_CARD}`)

    expect(cardZone?.cardId).toBe(TEST_CARD)
  })

  it('memoizes equivalent work-zone states for impossible final totals', () => {
    const state = { players: [], enableFarmersOfTheMoor: true } as unknown as GameState
    const player = playerWithPasture({ minorPlayed: ['D012_MilkingPlace'] })
    player.resources.sheep = 8
    player.resources.boar = 6
    player.resources.cattle = 0
    player.resources.horse = 0
    player.pastures = Array.from({ length: 7 }, (_, index) => ({
      id: `p${index}`,
      size: 1,
      tiles: [{ row: 0, col: index }],
      stables: 0,
      animalType: index < 4 ? 'sheep' : 'boar',
      animalCount: 2,
    }))

    const start = Date.now()
    expect(canAccommodateAnimalTotals(state, player, { sheep: 7, boar: 7 })).toBe(false)
    expect(Date.now() - start).toBeLessThan(1000)
  })

  it('rejects assignments blocked by card-zone validation', () => {
    const reg = getActiveCardRegistry()
    if (!reg) throw new Error('no active registry')
    reg.setEffect({
      id: TEST_CARD,
      onComputeAnimalZones: () => [
        {
          id: `card:${TEST_CARD}`,
          zoneType: 'card',
          capacity: 2,
          cardId: TEST_CARD,
          allowedAnimalType: null,
        } as AnimalZone,
      ],
      getInvalidAnimals: (_player, _zone, meeples) =>
        meeples.filter((meeple) => meeple.type === 'boar'),
    })
    const state = { players: [] } as unknown as GameState
    const player = playerWithPasture({ minorPlayed: ['D012_MilkingPlace', TEST_CARD], pastures: [] })

    expect(canAccommodateAnimalTotals(state, player, { sheep: 1, boar: 1 })).toBe(false)
  })

  it('enforces exclusive card-zone limits when checking final totals', () => {
    const reg = getActiveCardRegistry()
    if (!reg) throw new Error('no active registry')
    reg.setEffect({
      id: TEST_CARD,
      onComputeAnimalZones: () => [
        {
          id: `card:${TEST_CARD}@0-0`,
          zoneType: 'card',
          cardId: TEST_CARD,
          capacity: 2,
          allowedAnimalType: 'horse',
          exclusiveCardZoneLimit: 1,
        } as AnimalZone,
        {
          id: `card:${TEST_CARD}@0-1`,
          zoneType: 'card',
          cardId: TEST_CARD,
          capacity: 2,
          allowedAnimalType: 'horse',
          exclusiveCardZoneLimit: 1,
        } as AnimalZone,
      ],
    })
    const state = { players: [], enableFarmersOfTheMoor: true } as unknown as GameState
    const player = playerWithPasture({ minorPlayed: [TEST_CARD], pastures: [] })

    expect(canAccommodateAnimalTotals(state, player, { horse: 3 })).toBe(true)
    expect(canAccommodateAnimalTotals(state, player, { horse: 4 })).toBe(false)
  })

  it('gates horse accommodation on Farmers of the Moor', () => {
    const session = new GameSession()
    const player = session.getState().state.players[0]

    expect(canAccommodateAnimalTotals({ players: [] } as unknown as GameState, player, { horse: 1 })).toBe(false)
    expect(canAccommodateAnimalTotals({ players: [], enableFarmersOfTheMoor: true } as unknown as GameState, player, { horse: 1 })).toBe(true)
  })

  it('zones() returns at least the house zone on initial state', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    const zones = board.animals.zones()
    expect(zones.length).toBeGreaterThan(0)
    expect(zones.some((z) => z.zoneType === 'house')).toBe(true)
  })

  it('countAnimals returns 0 for sheep / boar / cattle on initial state', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    expect(board.animals.countAnimals('sheep')).toBe(0)
    expect(board.animals.countAnimals('boar')).toBe(0)
    expect(board.animals.countAnimals('cattle')).toBe(0)
  })

  it('totalCapacity is at least 1 on bare farm (house holds one animal)', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    expect(board.animals.totalCapacity()).toBeGreaterThanOrEqual(1)
  })

  it('looseStableKeys is empty when player has no stables placed', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    expect(board.animals.looseStableKeys()).toEqual([])
  })

  it('pastureCapacity returns 0 for an unknown zone id', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    expect(board.animals.pastureCapacity('does-not-exist')).toBe(0)
  })

  it('enforceCapacity clamps over-supplied animals to pasture capacity', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]
    // Inject a single-tile pasture (capacity = size * 2 * 2^stables = 2)
    // and 5 sheep. enforceCapacity must clamp the sheep total to what
    // fits across all zones (pasture=2 + house=1 = 3).
    player.pastures = [
      {
        id: 'p1',
        size: 1,
        tiles: [{ row: 0, col: 0 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]
    player.resources.sheep = 5
    player.resources.boar = 0
    player.resources.cattle = 0

    const board = playerBoard(state, 0)
    board.animals.enforceCapacity()

    // Pasture (cap 2) + house (cap 1) = 3 sheep retained.
    expect(player.resources.sheep).toBe(3)
    const pasture = player.pastures[0]
    expect(pasture.animalType).toBe('sheep')
    expect(pasture.animalCount).toBe(2)
    expect(player.houseAnimalType).toBe('sheep')
    expect(player.houseAnimalCount).toBe(1)
  })

  it('enforceCapacity keeps M084 lying horses in visible animal zones', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.enableFarmersOfTheMoor = true
    const player = state.players[0]
    player.resources.horse = 1
    player.houseAnimalType = 'horse'
    player.houseAnimalCount = 1
    player.pastures = []
    player.cardStates = {
      M084_BogPony: { extraData: { lyingHorseCount: 1 } },
    }

    playerBoard(state, 0).animals.enforceCapacity()

    expect(player.resources.horse).toBe(1)
    expect(player.houseAnimalType).toBe('horse')
    expect(player.houseAnimalCount).toBe(1)
    expect(player.cardStates.M084_BogPony?.extraData?.lyingHorseCount).toBe(1)
  })

  it('enforceCapacity discards excess visible animals before a M084 lying horse occupying the house', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.enableFarmersOfTheMoor = true
    const player = state.players[0]
    player.resources.sheep = 1
    player.resources.horse = 1
    player.houseAnimalType = 'horse'
    player.houseAnimalCount = 1
    player.pastures = []
    player.cardStates = {
      M084_BogPony: { extraData: { lyingHorseCount: 1 } },
    }

    playerBoard(state, 0).animals.enforceCapacity()

    expect(player.resources.sheep).toBe(0)
    expect(player.resources.horse).toBe(1)
    expect(player.houseAnimalType).toBe('horse')
    expect(player.houseAnimalCount).toBe(1)
    expect(player.cardStates.M084_BogPony?.extraData?.lyingHorseCount).toBe(1)
  })

  it('enforceCapacity consumes M084 lying markers first when horses are evicted', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.enableFarmersOfTheMoor = true
    const player = state.players[0]
    player.resources.sheep = 1
    player.resources.horse = 1
    player.minorPlayed = ['M084_BogPony']
    player.houseAnimalType = 'sheep'
    player.houseAnimalCount = 1
    player.pastures = []
    player.cardStates = {
      M084_BogPony: { extraData: { lyingHorseCount: 1 } },
    }

    playerBoard(state, 0).animals.enforceCapacity()

    expect(player.resources.sheep).toBe(1)
    expect(player.resources.horse).toBe(0)
    expect(player.houseAnimalType).toBe('sheep')
    expect(player.houseAnimalCount).toBe(1)
    expect(player.cardStates.M084_BogPony?.extraData?.lyingHorseCount ?? 0).toBe(0)
  })

  it('enforceCapacity preserves active card-zone animals instead of copying them into the house', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.enableFarmersOfTheMoor = true
    const player = state.players[0]
    const zoneId = buildCardAnimalZoneId('M035_HorseTrough', { row: 2, col: 1 })
    player.resources.horse = 1
    player.minorPlayed = ['M035_HorseTrough', 'M084_BogPony']
    player.pastures = []
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.cardStates = {
      M035_HorseTrough: {
        extraData: {
          animalCountsByZone: {
            [zoneId]: { animalCounts: { horse: 1 }, animalType: 'horse', held: 1 },
          },
        },
      },
      M084_BogPony: { extraData: { lyingHorseCount: 1 } },
    }

    playerBoard(state, 0).animals.enforceCapacity()

    expect(player.resources.horse).toBe(1)
    expect(player.houseAnimalType).toBeNull()
    expect(player.houseAnimalCount).toBe(0)
    expect(player.cardStates.M035_HorseTrough?.extraData?.animalCountsByZone).toEqual({
      [zoneId]: expect.objectContaining({ animalCounts: { horse: 1 } }),
    })
    expect(getAssignedAnimalsByType(player).horse).toBe(1)
    expect(player.cardStates.M084_BogPony?.extraData?.lyingHorseCount ?? 0).toBe(1)
  })

  it('enforceCapacity reserves counter-backed card zones without persisting ordinary holder storage', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]
    player.resources.boar = 1
    player.occupationPlayed = ['C148_MudWallower']
    player.pastures = []
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.cardStates = {
      C148_MudWallower: { counters: { counter: 0, held: 1 } },
    }

    playerBoard(state, 0).animals.enforceCapacity()

    expect(player.resources.boar).toBe(1)
    expect(player.houseAnimalType).toBeNull()
    expect(player.houseAnimalCount).toBe(0)
    expect(player.cardStates.C148_MudWallower?.extraData).toBeUndefined()
    expect(getAssignedAnimalsByType(player).boar).toBe(0)

    applyAnimalPayment(player, state, 'boar', 1)

    expect(player.resources.boar).toBe(0)
    expect(player.cardStates.C148_MudWallower?.counters?.held).toBe(0)
  })

  it('enforceCapacity clears stale keyed card-zone storage when no active zones remain', () => {
    const reg = getActiveCardRegistry()
    if (!reg) throw new Error('no active registry')
    reg.setEffect({ id: TEST_CARD, onComputeAnimalZones: () => [] })
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]
    player.resources.sheep = 1
    player.minorPlayed = [TEST_CARD]
    player.pastures = []
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.cardStates = {
      [TEST_CARD]: {
        extraData: {
          animalCountsByZone: {
            [`card:${TEST_CARD}@0-0`]: { animalCounts: { sheep: 1 } },
          },
        },
      },
    }

    playerBoard(state, 0).animals.enforceCapacity()

    expect(player.houseAnimalType).toBe('sheep')
    expect(player.houseAnimalCount).toBe(1)
    expect(player.cardStates[TEST_CARD]?.extraData?.animalCountsByZone).toBeUndefined()
    expect(getAssignedAnimalsByType(player).sheep).toBe(1)
  })

  it('enforceCapacity clamps counter-backed card reservations to zone capacity', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]
    player.resources.boar = 2
    player.occupationPlayed = ['C148_MudWallower']
    player.pastures = []
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.cardStates = {
      C148_MudWallower: { counters: { counter: 0, held: 1 } },
    }

    playerBoard(state, 0).animals.enforceCapacity()

    expect(player.resources.boar).toBe(2)
    expect(player.houseAnimalType).toBe('boar')
    expect(player.houseAnimalCount).toBe(1)
    expect(player.cardStates.C148_MudWallower?.extraData).toBeUndefined()
    const c148Zone = computeAnimalZones(player, state).find((zone) => zone.cardId === 'C148_MudWallower')
    expect(c148Zone?.animalCount).toBe(1)
  })
})
