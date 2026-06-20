import { defineMajorCard } from '../card-source'
import type { CardSourceMetaInput } from '../card-source'

const fireplace1: CardSourceMetaInput = {
  id: 'Major_Fireplace1',
  name: 'Fireplace',
  deck: 'major',
  number: 1,
  cost: { clay: 2 },
  vp: 1,
  extraVp: false,
  isCookery: true,
  isBaking: true,
  fireplaceIdentity: true,
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

export const Major_Fireplace1 = defineMajorCard({
  meta: fireplace1,
})

export const Major_Fireplace2 = defineMajorCard({
  meta: {
  ...fireplace1,
  id: 'Major_Fireplace2',
  number: 2,
  cost: { clay: 3 },
  exchanges: [
    { from: { sheep: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace2', triggers: ['anytime'] },
    { from: { boar: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace2', triggers: ['anytime'] },
    { from: { cattle: 1 }, to: { food: 3 }, sourceId: 'Major_Fireplace2', triggers: ['anytime'] },
    { from: { vegetable: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace2', triggers: ['anytime'] },
    { from: { grain: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace2', triggers: ['bake-bread'] },
  ],
} satisfies CardSourceMetaInput,
})

export const Major_Fireplace3 = defineMajorCard({
  meta: {
  ...fireplace1,
  id: 'Major_Fireplace3',
  number: 11,
  cost: { clay: 3 },
  exchanges: [
    { from: { sheep: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace3', triggers: ['anytime'] },
    { from: { boar: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace3', triggers: ['anytime'] },
    { from: { cattle: 1 }, to: { food: 3 }, sourceId: 'Major_Fireplace3', triggers: ['anytime'] },
    { from: { vegetable: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace3', triggers: ['anytime'] },
    { from: { grain: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace3', triggers: ['bake-bread'] },
  ],
} satisfies CardSourceMetaInput,
})
