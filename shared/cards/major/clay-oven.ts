import { defineMajorCard } from '../card-source'

const buildClayOvenImpl = (cardId: string) => ({
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

export const Major_ClayOven = defineMajorCard({
  meta: {
  id: 'Major_ClayOven',
  name: 'Clay Oven',
  deck: 'major',
  number: 5,
  cost: { clay: 3, stone: 1 },
  vp: 2,
  extraVp: false,
  isBaking: true,
  ovenIdentity: true,
  desc: [
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW-1X> 5<FOOD>',
    '[When you build it, you can Bake immediately]',
  ],
  exchanges: [
    { from: { grain: 1 }, to: { food: 5 }, sourceId: 'Major_ClayOven', max: 1, triggers: ['bake-bread'] },
  ],
},
  impl: buildClayOvenImpl('Major_ClayOven'),
})

export const Major_ClayOven2 = defineMajorCard({
  meta: {
  id: 'Major_ClayOven2',
  name: 'Clay Oven',
  deck: 'major',
  number: 14,
  cost: { clay: 4, stone: 1 },
  vp: 2,
  extraVp: false,
  isBaking: true,
  ovenIdentity: true,
  desc: [
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW-1X> 5<FOOD>',
    '[When you build it, you can Bake immediately]',
  ],
  exchanges: [
    { from: { grain: 1 }, to: { food: 5 }, sourceId: 'Major_ClayOven2', max: 1, triggers: ['bake-bread'] },
  ],
},
  impl: buildClayOvenImpl('Major_ClayOven2'),
})
