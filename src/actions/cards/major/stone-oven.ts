import { canBakeBread } from '../../effects/bake-bread'
import type { MajorCardEffect } from './types'

export const stoneOven: MajorCardEffect = {
  id: 'Major_StoneOven',
  cost: { clay: 1, stone: 3 },
  vp: 3,
  extraVp: false,
  description: [
    '[__Bake Bread__ action:]',
    '<GRAIN> → 4<FOOD> (max 2)',
    '[When you build it, you can Bake immediately]',
  ],
  onBuy: (_, player) => {
    player.majorEffects.pendingBake = canBakeBread(player, 'Major_StoneOven')
  },
}
