import type { MajorCardDisplay } from '../../cards/major/types'

export const stoneOven: MajorCardDisplay = {
  id: 'Major_StoneOven',
  name: 'Stone Oven',
  deck: 'major',
  number: 6,
  cost: { clay: 1, stone: 3 },
  vp: 3,
  extraVp: false,
  isBaking: true,
  desc: [
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW-2X> 4<FOOD>',
    '[When you build it, you can Bake immediately]',
  ],
}
