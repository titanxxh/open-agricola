import { defineMajorCard } from '../card-source'

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
},
  impl: {
    effect: {
      id: 'Major_StoneOven',
      onBuy: () => ({
        type: 'leaf',
        actionId: 'bake-bread',
        optional: true,
        sourceCard: 'Major_StoneOven',
      }),
    },
  },
})
