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
    '<VEGETABLE> <ARROW> 2<FOOD>      <PIG> <ARROW> 2<FOOD>',
    '<SHEEP> <ARROW> 2<FOOD>      <CATTLE> <ARROW> 3<FOOD>',
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW> 2<FOOD>',
  ],
}

export const fireplace2: MajorCardEffect = {
  ...fireplace1,
  id: 'Major_Fireplace2',
  cost: { clay: 3 },
}
