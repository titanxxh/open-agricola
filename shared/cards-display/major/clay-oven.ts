import type { MajorCardData } from '../../cards/major/types'

export const clayOven: MajorCardData = {
  id: 'Major_ClayOven',
  name: 'Clay Oven',
  deck: 'major',
  number: 5,
  cost: { clay: 3, stone: 1 },
  vp: 2,
  extraVp: false,
  isBaking: true,
  desc: [
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW-1X> 5<FOOD>',
    '[When you build it, you can Bake immediately]',
  ],
  onBuy: () => ({
    type: 'leaf',
    actionId: 'bake-bread',
    optional: true,
    sourceCard: 'Major_ClayOven',
  }),
}
