import type { MajorCardData } from './types'

export const fireplace1: MajorCardData = {
  id: 'Major_Fireplace1',
  name: 'Fireplace',
  deck: 'major',
  number: 1,
  cost: { clay: 2 },
  vp: 1,
  extraVp: false,
  isCookery: true,
  isBaking: true,
  desc: [
    '[Anytime]',
    '<VEGETABLE> <ARROW> 2<FOOD>      <PIG> <ARROW> 2<FOOD>',
    '<SHEEP> <ARROW> 2<FOOD>      <CATTLE> <ARROW> 3<FOOD>',
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW> 2<FOOD>',
  ],
  exchanges: [
    { from: { sheep: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace1', triggers: ['anytime'] },
    { from: { boar: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace1', triggers: ['anytime'] },
    { from: { cattle: 1 }, to: { food: 3 }, sourceId: 'Major_Fireplace1', triggers: ['anytime'] },
    { from: { vegetable: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace1', triggers: ['anytime'] },
    { from: { grain: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace1', triggers: ['bake-bread'] },
  ],
}

export const fireplace2: MajorCardData = {
  ...fireplace1,
  id: 'Major_Fireplace2',
  number: 2,
  cost: { clay: 3 },
  exchanges: fireplace1.exchanges?.map((ex) => ({ ...ex, sourceId: 'Major_Fireplace2' })),
}
