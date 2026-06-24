import type { GameState, Resource } from '../../contract/types'
import { animalKeysForState, type AnimalKey } from '../../contract/animals'

export type HarvestCropType = 'grain' | 'vegetable'
export type NewbornAnimalType = AnimalKey

export type HarvestOutcome = {
  reapedCrops: Partial<Record<HarvestCropType, number>>
  harvestedCropTypes: HarvestCropType[]
  newbornAnimals: Partial<Pick<Resource, NewbornAnimalType>>
  newbornAnimalTypes: NewbornAnimalType[]
}

const CROP_TYPES: HarvestCropType[] = ['grain', 'vegetable']

export const getHarvestOutcome = (state: GameState, playerId: string): HarvestOutcome => {
  const reapedCrops: Partial<Record<HarvestCropType, number>> = {}
  const reap = state.harvestReapSummary?.[playerId]
  for (const entry of reap?.harvestedCrops ?? []) {
    if (!CROP_TYPES.includes(entry.crop as HarvestCropType)) continue
    if (entry.amount <= 0) continue
    const crop = entry.crop as HarvestCropType
    reapedCrops[crop] = (reapedCrops[crop] ?? 0) + entry.amount
  }

  const breed = state.harvestBreedSummary?.[playerId]
  const newbornAnimals: Partial<Pick<Resource, NewbornAnimalType>> = {}
  const animalTypes = animalKeysForState(state)
  for (const animal of animalTypes) {
    const amount = breed?.resources?.[animal] ?? 0
    if (amount > 0) newbornAnimals[animal] = amount
  }

  return {
    reapedCrops,
    harvestedCropTypes: CROP_TYPES.filter((crop) => (reapedCrops[crop] ?? 0) > 0),
    newbornAnimals,
    newbornAnimalTypes: animalTypes.filter((animal) => (newbornAnimals[animal] ?? 0) > 0),
  }
}
