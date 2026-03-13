import type { MajorCardEffect } from './types'

export const cookingHearth1: MajorCardEffect = {
  id: 'Major_CookingHearth1',
  cost: {
    fee: { clay: 4 },
    cards: { type: 'Major', list: ['Major_Fireplace1', 'Major_Fireplace2'] },
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
    '[May upgrade from Fireplace by returning it]',
  ],
}

export const cookingHearth2: MajorCardEffect = {
  ...cookingHearth1,
  id: 'Major_CookingHearth2',
  cost: {
    fee: { clay: 5 },
    cards: { type: 'Major', list: ['Major_Fireplace1', 'Major_Fireplace2'] },
  },
}
