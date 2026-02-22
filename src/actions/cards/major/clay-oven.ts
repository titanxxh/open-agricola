import type { MajorCardEffect } from './types'

export const clayOven: MajorCardEffect = {
  id: 'Major_ClayOven',
  cost: { clay: 3, stone: 1 },
  vp: 2,
  extraVp: false,
  description: [
    '[Bake Bread action]',
    'Grain → 5 food',
    '[When you build it, you can bake immediately]',
  ],
}
