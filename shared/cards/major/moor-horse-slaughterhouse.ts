import { defineMajorCard } from '../card-source'
import type { CardSourceMetaInput } from '../card-source'

const horseSlaughterhouse1: CardSourceMetaInput = {
  id: 'Major_Moor_HorseSlaughterhouse1',
  name: 'Horse Slaughterhouse',
  deck: 'major',
  number: 101,
  cost: { clay: 1, stone: 1 },
  vp: 2,
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
