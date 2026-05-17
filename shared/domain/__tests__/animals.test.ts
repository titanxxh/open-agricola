import { describe, expect, it } from 'vitest'
import { getAssignedAnimalsByType, getAssignedAnimalCount } from '../animals'
import type { PlayerState } from '../../contract/types'

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

  it('counts animal-holder card zones (extraData.held style)', () => {
    const p = mkPlayer({
      cardStates: {
        C148_MudWallower: { extraData: { held: 2, animalType: 'boar' } },
      } as PlayerState['cardStates'],
    })
    expect(getAssignedAnimalsByType(p)).toEqual({ sheep: 0, boar: 2, cattle: 0 })
  })

  it('counts animal-holder card zones (counters.held + extraData.animalType — C148 actual schema)', () => {
    const p = mkPlayer({
      cardStates: {
        C148_MudWallower: {
          counters: { held: 3, counter: 1 },
          extraData: { animalType: 'boar' },
        },
      } as unknown as PlayerState['cardStates'],
    })
    expect(getAssignedAnimalsByType(p)).toEqual({ sheep: 0, boar: 3, cattle: 0 })
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
