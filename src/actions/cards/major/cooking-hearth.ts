import type { MajorCardEffect } from './types'

export const cookingHearth1: MajorCardEffect = {
  id: 'Major_CookingHearth1',
  cost: { clay: 4 },
  vp: 1,
  extraVp: false,
  description: [
    '[Anytime]',
    'Vegetable → 3 food',
    'Boar → 3 food',
    'Sheep → 2 food',
    'Cattle → 4 food',
    '[Bake Bread action]',
    'Grain → 3 food',
  ],
}

export const cookingHearth2: MajorCardEffect = {
  ...cookingHearth1,
  id: 'Major_CookingHearth2',
  cost: { clay: 5 },
}
