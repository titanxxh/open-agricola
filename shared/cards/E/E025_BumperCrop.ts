import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { getLogicalFields } from '../helpers/card-field'

const CARD_ID = 'E025_BumperCrop'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    // Only trigger reap if there are planted fields with crops to harvest
    const hasCrops = getLogicalFields(player).some((field) => field.stacks.length > 0)
    if (!hasCrops) return
    return {
      type: 'leaf' as const,
      actionId: 'reap',
      sourceCard: CARD_ID,
      actionContext: { trigger: { phase: 'private-field-phase' } },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E025_BumperCrop = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Bumper Crop',
    deck: 'E',
    number: 25,
    category: 'ACTION',
    desc: ['When you play this card, immediately carry out the field phase on your farmyard only. (This is not a harvest.)'],
    vp: 1,
    prerequisite: '2 Grain Fields',
  },
  impl: cardImpl,
})

export const E025_BumperCrop_impl = E025_BumperCrop.impl
