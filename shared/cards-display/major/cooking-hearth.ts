import type { MajorCardData } from '../../cards/major/types'

export const cookingHearth1: MajorCardData = {
  id: 'Major_CookingHearth1',
  name: 'Cooking Hearth',
  deck: 'major',
  number: 3,
  cost: {
    fee: { clay: 4 },
    cards: { type: 'Major', list: ['Major_Fireplace1', 'Major_Fireplace2'] },
  },
  vp: 1,
  extraVp: false,
  isCookery: true,
  isBaking: true,
  returnCards: ['Major_Fireplace1', 'Major_Fireplace2'],
  desc: [
    '[Anytime]',
    '<VEGETABLE> <ARROW> 3<FOOD>      <PIG> <ARROW> 3<FOOD>',
    '<SHEEP> <ARROW> 2<FOOD>      <CATTLE> <ARROW> 4<FOOD>',
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW> 3<FOOD>',
  ],
  exchanges: [
    { from: { sheep: 1 }, to: { food: 2 }, sourceId: 'Major_CookingHearth1', triggers: ['anytime'] },
    { from: { boar: 1 }, to: { food: 3 }, sourceId: 'Major_CookingHearth1', triggers: ['anytime'] },
    { from: { cattle: 1 }, to: { food: 4 }, sourceId: 'Major_CookingHearth1', triggers: ['anytime'] },
    { from: { vegetable: 1 }, to: { food: 3 }, sourceId: 'Major_CookingHearth1', triggers: ['anytime'] },
    { from: { grain: 1 }, to: { food: 3 }, sourceId: 'Major_CookingHearth1', triggers: ['bake-bread'] },
  ],
}

export const cookingHearth2: MajorCardData = {
  ...cookingHearth1,
  id: 'Major_CookingHearth2',
  number: 4,
  cost: {
    fee: { clay: 5 },
    cards: { type: 'Major', list: ['Major_Fireplace1', 'Major_Fireplace2'] },
  },
  exchanges: cookingHearth1.exchanges?.map((ex) => ({ ...ex, sourceId: 'Major_CookingHearth2' })),
}
