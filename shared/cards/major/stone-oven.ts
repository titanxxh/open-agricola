import type { MajorCardEffect } from './types'

export const stoneOven: MajorCardEffect = {
  id: 'Major_StoneOven',
  cost: { clay: 1, stone: 3 },
  vp: 3,
  extraVp: false,
  isBaking: true,
  description: [
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW-2X> 4<FOOD>',
    '[When you build it, you can Bake immediately]',
  ],
  onBuy: () => ({
    type: 'leaf',
    actionId: 'bake-bread',
    optional: true,
  }),
}
