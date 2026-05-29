import type { GameState, Resource } from '../../contract/types'

export type HarvestCropType = 'grain' | 'vegetable'
export type NewbornAnimalType = 'sheep' | 'boar' | 'cattle'

export type HarvestOutcome = {
  reapedCrops: Partial<Record<HarvestCropType, number>>
  harvestedCropTypes: HarvestCropType[]
  newbornAnimals: Partial<Pick<Resource, NewbornAnimalType>>
  newbornAnimalTypes: NewbornAnimalType[]
}

const CROP_TYPES: HarvestCropType[] = ['grain', 'vegetable']
const ANIMAL_TYPES: NewbornAnimalType[] = ['sheep', 'boar', 'cattle']

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
  for (const animal of ANIMAL_TYPES) {
    const amount = breed?.resources?.[animal] ?? 0
    if (amount > 0) newbornAnimals[animal] = amount
  }

  return {
    reapedCrops,
    harvestedCropTypes: CROP_TYPES.filter((crop) => (reapedCrops[crop] ?? 0) > 0),
    newbornAnimals,
    newbornAnimalTypes: ANIMAL_TYPES.filter((animal) => (newbornAnimals[animal] ?? 0) > 0),
  }
}
