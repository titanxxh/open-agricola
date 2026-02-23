import { canBakeBread } from '../../effects/bake-bread'
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
  onBuy: (_, player) => {
    player.majorEffects.pendingBake = canBakeBread(player, 'Major_ClayOven')
  },
}
