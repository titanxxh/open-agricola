import type { Resource } from './types'

export type Occupation = {
  id: string
  cost: Partial<Resource>
  reward?: Partial<Resource>
}

export const occupations: Occupation[] = [
  { id: 'forest-helper', cost: { food: 1 }, reward: { wood: 2 } },
  { id: 'clay-helper', cost: { food: 1 }, reward: { clay: 2 } },
  { id: 'reed-helper', cost: { food: 1 }, reward: { reed: 2 } },
  { id: 'stone-helper', cost: { food: 1 }, reward: { stone: 1 } },
  { id: 'field-mentor', cost: { food: 1 }, reward: { grain: 1 } },
  { id: 'animal-keeper', cost: { food: 1 }, reward: { sheep: 1 } },
  { id: 'B109_PaperMaker', cost: { food: 1 } },
  { id: 'B103_FieldMerchant', cost: { food: 1 } },
  { id: 'E130_Overachiever', cost: { food: 1 } },
  { id: 'A126_MasterWorkman', cost: { food: 1 } },
]

export const occupationIds = occupations.map((occupation) => occupation.id)

export const getOccupation = (id: string) =>
  occupations.find((occupation) => occupation.id === id)
