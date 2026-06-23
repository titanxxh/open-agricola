import { defineMajorCard } from '../card-source'
import type { CardSourceMetaInput } from '../card-source'

const horseSlaughterhouse1: CardSourceMetaInput = {
  id: 'Major_Moor_HorseSlaughterhouse1',
  name: 'Horse Slaughterhouse',
  deck: 'major',
  number: 101,
  cost: { clay: 1, stone: 1 },
  vp: 0,
  extraVp: false,
  isCookery: true,
  desc: [
    '[Anytime]',
    '<SHEEP> <ARROW> 1<FOOD>      <PIG> <ARROW> 1<FOOD>',
    '<CATTLE> <ARROW> 2<FOOD>      <HORSE> <ARROW> 2<FOOD>',
  ],
  exchanges: [
    { from: { sheep: 1 }, to: { food: 1 }, sourceId: 'Major_Moor_HorseSlaughterhouse1', triggers: ['anytime'] },
    { from: { boar: 1 }, to: { food: 1 }, sourceId: 'Major_Moor_HorseSlaughterhouse1', triggers: ['anytime'] },
    { from: { cattle: 1 }, to: { food: 2 }, sourceId: 'Major_Moor_HorseSlaughterhouse1', triggers: ['anytime'] },
    { from: { horse: 1 }, to: { food: 2 }, sourceId: 'Major_Moor_HorseSlaughterhouse1', triggers: ['anytime'] },
  ],
}

export const Major_Moor_HorseSlaughterhouse1 = defineMajorCard({
  meta: horseSlaughterhouse1,
})

export const Major_Moor_HorseSlaughterhouse2 = defineMajorCard({
  meta: {
    ...horseSlaughterhouse1,
    id: 'Major_Moor_HorseSlaughterhouse2',
    number: 102,
    exchanges: [
      { from: { sheep: 1 }, to: { food: 1 }, sourceId: 'Major_Moor_HorseSlaughterhouse2', triggers: ['anytime'] },
      { from: { boar: 1 }, to: { food: 1 }, sourceId: 'Major_Moor_HorseSlaughterhouse2', triggers: ['anytime'] },
      { from: { cattle: 1 }, to: { food: 2 }, sourceId: 'Major_Moor_HorseSlaughterhouse2', triggers: ['anytime'] },
      { from: { horse: 1 }, to: { food: 2 }, sourceId: 'Major_Moor_HorseSlaughterhouse2', triggers: ['anytime'] },
    ],
  } satisfies CardSourceMetaInput,
})

const cookhouse1: CardSourceMetaInput = {
  id: 'Major_Moor_Cookhouse1',
  name: 'Cookhouse',
  deck: 'major',
  number: 103,
  cost: {
    fee: { clay: 6 },
    cards: {
      type: 'Major',
      list: [
        'Major_Fireplace1',
        'Major_Fireplace2',
        'Major_Fireplace3',
        'Major_CookingHearth1',
        'Major_CookingHearth2',
        'Major_CookingHearth3',
      ],
    },
  },
  vp: 0,
  extraVp: false,
  isCookery: true,
  isBaking: true,
  cookingHearthIdentity: true,
  returnCards: [
    'Major_Fireplace1',
    'Major_Fireplace2',
    'Major_Fireplace3',
    'Major_CookingHearth1',
    'Major_CookingHearth2',
    'Major_CookingHearth3',
  ],
  desc: [
    '[Anytime]',
    '<VEGETABLE> <ARROW> 3<FOOD>      <PIG> <ARROW> 3<FOOD>',
    '<SHEEP> <ARROW> 2<FOOD>      <CATTLE> <ARROW> 4<FOOD>',
    '<HORSE> <ARROW> 2<FOOD>',
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW> 3<FOOD>',
  ],
  exchanges: [
    { from: { sheep: 1 }, to: { food: 2 }, sourceId: 'Major_Moor_Cookhouse1', triggers: ['anytime'] },
    { from: { boar: 1 }, to: { food: 3 }, sourceId: 'Major_Moor_Cookhouse1', triggers: ['anytime'] },
    { from: { cattle: 1 }, to: { food: 4 }, sourceId: 'Major_Moor_Cookhouse1', triggers: ['anytime'] },
    { from: { horse: 1 }, to: { food: 2 }, sourceId: 'Major_Moor_Cookhouse1', triggers: ['anytime'] },
    { from: { vegetable: 1 }, to: { food: 3 }, sourceId: 'Major_Moor_Cookhouse1', triggers: ['anytime'] },
    { from: { grain: 1 }, to: { food: 3 }, sourceId: 'Major_Moor_Cookhouse1', triggers: ['bake-bread'] },
  ],
}

export const Major_Moor_Cookhouse1 = defineMajorCard({
  meta: cookhouse1,
})

export const Major_Moor_Cookhouse2 = defineMajorCard({
  meta: {
    ...cookhouse1,
    id: 'Major_Moor_Cookhouse2',
    number: 104,
    exchanges: [
      { from: { sheep: 1 }, to: { food: 2 }, sourceId: 'Major_Moor_Cookhouse2', triggers: ['anytime'] },
      { from: { boar: 1 }, to: { food: 3 }, sourceId: 'Major_Moor_Cookhouse2', triggers: ['anytime'] },
      { from: { cattle: 1 }, to: { food: 4 }, sourceId: 'Major_Moor_Cookhouse2', triggers: ['anytime'] },
      { from: { horse: 1 }, to: { food: 2 }, sourceId: 'Major_Moor_Cookhouse2', triggers: ['anytime'] },
      { from: { vegetable: 1 }, to: { food: 3 }, sourceId: 'Major_Moor_Cookhouse2', triggers: ['anytime'] },
      { from: { grain: 1 }, to: { food: 3 }, sourceId: 'Major_Moor_Cookhouse2', triggers: ['bake-bread'] },
    ],
  } satisfies CardSourceMetaInput,
})
