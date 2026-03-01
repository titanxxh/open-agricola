import type { MajorCardEffect } from './types'

export const fireplace1: MajorCardEffect = {
  id: 'Major_Fireplace1',
  cost: { clay: 2 },
  vp: 1,
  extraVp: false,
  isCookery: true,
  isBaking: true,
  description: [
    '[Anytime]',
    'Vegetable → 2 food',
    'Boar → 2 food',
    'Sheep → 2 food',
    'Cattle → 3 food',
    '[Bake Bread action]',
    'Grain → 2 food',
  ],
}

export const fireplace2: MajorCardEffect = {
  ...fireplace1,
  id: 'Major_Fireplace2',
  cost: { clay: 3 },
}
