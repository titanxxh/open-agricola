import { defineMajorCard } from '../card-source'

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
},
  impl: {
    effect: {
      id: 'Major_ClayOven',
      onBuy: () => ({
        type: 'leaf',
        actionId: 'bake-bread',
        optional: true,
        sourceCard: 'Major_ClayOven',
      }),
    },
  },
})

export const Major_ClayOven2 = defineMajorCard({
  meta: {
  id: 'Major_ClayOven2',
  name: 'Clay Oven',
  deck: 'major',
  number: 14,
  cost: { clay: 3, stone: 1 },
  vp: 2,
  extraVp: false,
  desc: [
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW-1X> 5<FOOD>',
    '[When you build it, you can Bake immediately]',
  ],
},
})
