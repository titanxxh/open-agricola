import type { MajorCardEffect } from './types'

export const stoneOven: MajorCardEffect = {
  id: 'Major_StoneOven',
  cost: { clay: 1, stone: 3 },
  vp: 3,
  extraVp: false,
  description: [
    '[Bake Bread action]',
    'Grain → 6 food',
    '[When you build it, you can bake immediately]',
  ],
}
