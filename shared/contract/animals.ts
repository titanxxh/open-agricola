// Pure animal types. Sourced from S6a split of shared/domain/animals.ts.
export type BaseAnimalKey = 'sheep' | 'boar' | 'cattle'
export type AnimalKey = BaseAnimalKey | 'horse'

export const BASE_ANIMAL_KEYS = ['sheep', 'boar', 'cattle'] as const
export const ALL_ANIMAL_KEYS = ['sheep', 'boar', 'cattle', 'horse'] as const

export const animalKeysForState = (
  state?: { enableFarmersOfTheMoor?: boolean } | null,
): readonly AnimalKey[] => state?.enableFarmersOfTheMoor === true
  ? ALL_ANIMAL_KEYS
  : BASE_ANIMAL_KEYS
