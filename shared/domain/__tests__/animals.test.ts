import { describe, expect, it } from 'vitest'
import { getAssignedAnimalsByType, getAssignedAnimalCount } from '../animals'
import type { GameState, PlayerState } from '../../contract/types'

const NIGHT_PASTURE = 'M033_NightPasture'

const mkPlayer = (overrides: Partial<PlayerState>): PlayerState =>
  ({
    pastures: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    cardStates: {},
    resources: {
      sheep: 0,
      boar: 0,
      cattle: 0,
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
      food: 0,
      grain: 0,
      vegetable: 0,
      begging: 0,
    },
    ...overrides,
  } as unknown as PlayerState)

describe('getAssignedAnimalsByType', () => {
  it('zero placed: all types 0', () => {
    const p = mkPlayer({})
    expect(getAssignedAnimalsByType(p)).toEqual({ sheep: 0, boar: 0, cattle: 0 })
  })

  it('counts pasture animals by type', () => {
    const p = mkPlayer({
      pastures: [
        { id: 'pa-1', size: 1, tiles: [], stables: 0, animalType: 'sheep', animalCount: 3 },
        { id: 'pa-2', size: 1, tiles: [], stables: 0, animalType: 'cattle', animalCount: 2 },
      ] as PlayerState['pastures'],
    })
    expect(getAssignedAnimalsByType(p)).toEqual({ sheep: 3, boar: 0, cattle: 2 })
  })

  it('ignores empty pastures (no animalType or count 0)', () => {
    const p = mkPlayer({
      pastures: [
        { id: 'pa-1', size: 1, tiles: [], stables: 0, animalType: null, animalCount: 0 },
        { id: 'pa-2', size: 1, tiles: [], stables: 0, animalType: 'sheep', animalCount: 0 },
      ] as PlayerState['pastures'],
    })
    expect(getAssignedAnimalsByType(p)).toEqual({ sheep: 0, boar: 0, cattle: 0 })
  })

  it('counts house animal', () => {
    const p = mkPlayer({ houseAnimalType: 'boar', houseAnimalCount: 1 })
    expect(getAssignedAnimalsByType(p)).toEqual({ sheep: 0, boar: 1, cattle: 0 })
  })

  it('counts stable animals (1 per stable slot)', () => {
    const p = mkPlayer({
      stableAnimals: { 's-1': 'sheep', 's-2': 'sheep', 's-3': 'cattle', 's-4': null },
    })
    expect(getAssignedAnimalsByType(p)).toEqual({ sheep: 2, boar: 0, cattle: 1 })
  })

  it('counts assigned horses without producing NaN', () => {
    const p = mkPlayer({
      houseAnimalType: 'horse',
      houseAnimalCount: 1,
      stableAnimals: { 's-1': 'horse' },
    })
    expect(getAssignedAnimalsByType(p)).toEqual({ sheep: 0, boar: 0, cattle: 0, horse: 2 })
    expect(getAssignedAnimalCount(p)).toBe(2)
  })

  it('counts animal-holder card zones (extraData.held style)', () => {
    const p = mkPlayer({
      cardStates: {
        C148_MudWallower: { extraData: { held: 2, animalType: 'boar' } },
      } as PlayerState['cardStates'],
    })
    expect(getAssignedAnimalsByType(p)).toEqual({ sheep: 0, boar: 2, cattle: 0 })
  })

  it('counts per-zone animal-holder card storage', () => {
    const p = mkPlayer({
      cardStates: {
        M034_HomeWood: {
          extraData: {
            animalCountsByZone: {
              'card:M034_HomeWood@0,0': { animalCounts: { sheep: 2 } },
              'card:M034_HomeWood@0,1': { animalCounts: { cattle: 1 } },
            },
          },
        },
      } as unknown as PlayerState['cardStates'],
    })
    expect(getAssignedAnimalsByType(p)).toEqual({ sheep: 2, boar: 0, cattle: 1 })
  })

  it('counts hosted card-zone animals for the animal owner only', () => {
    const owner = mkPlayer({ id: 'owner', name: 'Owner' })
    const guest = mkPlayer({ id: 'guest', name: 'Guest' })
    const guestZoneId = `card:${NIGHT_PASTURE}:owner:${owner.id}:animalOwner:${guest.id}`
    owner.minorPlayed = [NIGHT_PASTURE]
    owner.cardStates = {
      [NIGHT_PASTURE]: {
        extraData: {
          animalCountsByZone: {
            [guestZoneId]: {
              animalCounts: { sheep: 1 },
              ownerPlayerId: owner.id,
              animalOwnerPlayerId: guest.id,
              cardId: NIGHT_PASTURE,
              capacity: 1,
              allowedAnimalType: null,
            },
          },
        },
      },
    } as unknown as PlayerState['cardStates']
    const state = { players: [owner, guest], enableFarmersOfTheMoor: true } as GameState

    expect(getAssignedAnimalsByType(guest, state).sheep).toBe(1)
    expect(getAssignedAnimalsByType(owner, state).sheep).toBe(0)
  })

  it('ignores cardStates.counters.held (C148-style permanent capacity counter)', () => {
    // C148_MudWallower uses counters.held as permanent capacity, not current
    // count, so we intentionally do NOT sum it here. See animals.ts JSDoc.
    const p = mkPlayer({
      cardStates: {
        C148_MudWallower: {
          counters: { held: 3, counter: 1 },
          extraData: {},
        },
      } as unknown as PlayerState['cardStates'],
    })
    expect(getAssignedAnimalsByType(p)).toEqual({ sheep: 0, boar: 0, cattle: 0 })
  })

  it('ignores card states without valid animal-holder extraData', () => {
    const p = mkPlayer({
      cardStates: {
        SomeCard: { extraData: { held: 0, animalType: 'sheep' } },
        OtherCard: { extraData: { held: 5 } }, // no animalType
        ThirdCard: { extraData: { held: 3, animalType: 'unknown' } },
      } as unknown as PlayerState['cardStates'],
    })
    expect(getAssignedAnimalsByType(p)).toEqual({ sheep: 0, boar: 0, cattle: 0 })
  })

  it('sums all sources', () => {
    const p = mkPlayer({
      pastures: [
        { id: 'pa-1', size: 1, tiles: [], stables: 0, animalType: 'sheep', animalCount: 2 },
      ] as PlayerState['pastures'],
      houseAnimalType: 'sheep',
      houseAnimalCount: 1,
      stableAnimals: { 's-1': 'sheep' },
      cardStates: {
        C148_MudWallower: { extraData: { held: 1, animalType: 'boar' } },
      } as PlayerState['cardStates'],
    })
    expect(getAssignedAnimalsByType(p)).toEqual({ sheep: 4, boar: 1, cattle: 0 })
  })
})

describe('getAssignedAnimalCount (sum compat)', () => {
  it('matches getAssignedAnimalsByType sum', () => {
    const p = mkPlayer({
      pastures: [
        { id: 'pa-1', size: 1, tiles: [], stables: 0, animalType: 'sheep', animalCount: 2 },
      ] as PlayerState['pastures'],
      houseAnimalType: 'cattle',
      houseAnimalCount: 1,
    })
    const byType = getAssignedAnimalsByType(p)
    expect(getAssignedAnimalCount(p)).toBe(byType.sheep + byType.boar + byType.cattle)
  })

  it('zero on empty', () => {
    expect(getAssignedAnimalCount(mkPlayer({}))).toBe(0)
  })
})
