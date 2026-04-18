import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { fieldIsEmpty } from '../../game/field'

const CARD_ID = 'E25_BumperCrop'

registerCardEffect({
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
})

export const E25_BumperCrop = new MinorImprovement({
  id: CARD_ID,
  name: 'Bumper Crop',
  deck: 'E',
  number: 25,
  category: 'FARM_PLANNER',
  desc: ['When you play this card, immediately carry out the field phase on your farmyard only. (This is not a harvest.)'],
  vp: 1,
  prerequisite: '2 Grain Fields',
  newSet: true,
})
