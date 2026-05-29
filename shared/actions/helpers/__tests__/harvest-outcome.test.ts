import { describe, expect, it } from 'vitest'
import type { GameState } from '../../../contract/types'
import { getHarvestOutcome } from '../harvest-outcome'

describe('getHarvestOutcome', () => {
  it('combines harvested crop types and newborn animal types for a player', () => {
    const state = {
      harvestReapSummary: {
        p1: {
          resources: { grain: 2, vegetable: 1 },
          grainFields: 1,
          vegetableFields: 1,
          harvestedCrops: [
            { row: 0, col: 0, crop: 'grain', amount: 2, sources: ['base'] },
            { row: 0, col: 1, crop: 'vegetable', amount: 1, sources: ['base'] },
            { row: 0, col: 2, crop: 'wood', amount: 0, sources: ['base'] },
          ],
        },
      },
      harvestBreedSummary: {
        p1: {
          resources: { sheep: 1, boar: 1 },
          animalTypes: 2,
          animalCount: 2,
        },
      },
    } as GameState

    expect(getHarvestOutcome(state, 'p1')).toEqual({
      reapedCrops: { grain: 2, vegetable: 1 },
      harvestedCropTypes: ['grain', 'vegetable'],
      newbornAnimals: { sheep: 1, boar: 1 },
      newbornAnimalTypes: ['sheep', 'boar'],
    })
  })

  it('returns empty outcome when summaries are absent', () => {
    expect(getHarvestOutcome({} as GameState, 'p1')).toEqual({
      reapedCrops: {},
      harvestedCropTypes: [],
      newbornAnimals: {},
      newbornAnimalTypes: [],
    })
  })
})
