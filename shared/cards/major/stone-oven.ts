import { defineMajorCard } from '../card-source'

const buildStoneOvenImpl = (cardId: string) => ({
  effect: {
    id: cardId,
    onBuy: () => ({
      type: 'leaf' as const,
      actionId: 'bake-bread',
      optional: true,
      sourceCard: cardId,
    }),
  },
})

export const Major_StoneOven = defineMajorCard({
  meta: {
  id: 'Major_StoneOven',
  name: 'Stone Oven',
  deck: 'major',
  number: 6,
  cost: { clay: 1, stone: 3 },
  vp: 3,
  extraVp: false,
  isBaking: true,
  ovenIdentity: true,
  desc: [
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW-2X> 4<FOOD>',
    '[When you build it, you can Bake immediately]',
  ],
  exchanges: [
    { from: { grain: 1 }, to: { food: 4 }, sourceId: 'Major_StoneOven', max: 2, triggers: ['bake-bread'] },
  ],
},
  impl: buildStoneOvenImpl('Major_StoneOven'),
})

export const Major_StoneOven2 = defineMajorCard({
  meta: {
  id: 'Major_StoneOven2',
  name: 'Stone Oven',
  deck: 'major',
  number: 15,
  cost: { clay: 1, stone: 3 },
  vp: 3,
  extraVp: false,
  isBaking: true,
  ovenIdentity: true,
  desc: [
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW-2X> 4<FOOD>',
    '[When you build it, you can Bake immediately]',
  ],
  exchanges: [
    { from: { grain: 1 }, to: { food: 4 }, sourceId: 'Major_StoneOven2', max: 2, triggers: ['bake-bread'] },
  ],
},
  impl: buildStoneOvenImpl('Major_StoneOven2'),
})
