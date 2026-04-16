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
    '<VEGETABLE> <ARROW> 3<FOOD>      <PIG> <ARROW> 3<FOOD>',
    '<SHEEP> <ARROW> 2<FOOD>      <CATTLE> <ARROW> 4<FOOD>',
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW> 3<FOOD>',
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
