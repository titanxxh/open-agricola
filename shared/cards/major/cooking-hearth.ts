import type { MajorCardEffect } from './types'

export const cookingHearth1: MajorCardEffect = {
  id: 'Major_CookingHearth1',
  cost: {
    fees: [
      { clay: 4 },
      { clay: 2 },
    ],
    cards: { type: 'Major', list: ['Major_Fireplace1', 'Major_Fireplace2'], cost: { clay: 2 } },
  },
  vp: 1,
  extraVp: false,
  isCookery: true,
  isBaking: true,
  returnCards: ['Major_Fireplace1', 'Major_Fireplace2'],
  description: [
    '[Anytime]',
    'Vegetable → 3 food',
    'Boar → 3 food',
    'Sheep → 2 food',
    'Cattle → 4 food',
    '[Bake Bread action]',
    'Grain → 3 food',
    '[May upgrade from Fireplace by returning it and paying 2 clay]',
  ],
}

export const cookingHearth2: MajorCardEffect = {
  ...cookingHearth1,
  id: 'Major_CookingHearth2',
  cost: {
    fees: [
      { clay: 5 },
      { clay: 3 },
    ],
    cards: { type: 'Major', list: ['Major_Fireplace1', 'Major_Fireplace2'], cost: { clay: 3 } },
  },
}
