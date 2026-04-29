import { MinorImprovement } from '../types'
import { fieldIsEmpty } from '../../game/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'E25_BumperCrop'

export const E25_BumperCrop = new MinorImprovement({
  id: CARD_ID,
  name: 'Bumper Crop',
  deck: 'E',
  number: 25,
  category: 'ACTION',
  desc: ['When you play this card, immediately carry out the field phase on your farmyard only. (This is not a harvest.)'],
  vp: 1,
  prerequisite: '2 Grain Fields',
  newSet: true,
})

export const E25_BumperCrop_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    // Only trigger reap if there are planted fields with crops to harvest
    const hasCrops = player.fields.some((f) => !fieldIsEmpty(f))
    if (!hasCrops) return
    return {
      type: 'leaf' as const,
      actionId: 'reap',
      sourceCard: CARD_ID,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
