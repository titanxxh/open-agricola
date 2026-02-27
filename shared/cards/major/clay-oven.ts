import type { MajorCardEffect } from './types'

export const clayOven: MajorCardEffect = {
  id: 'Major_ClayOven',
  cost: { clay: 3, stone: 1 },
  vp: 2,
  extraVp: false,
  description: [
    '[__Bake Bread__ action:]',
    '<GRAIN> → 5<FOOD> (max 1)',
    '[When you build it, you can Bake immediately]',
  ],
  onBuy: () => ({
    type: 'leaf',
    actionId: 'bake-bread',
    optional: true,
  }),
}
