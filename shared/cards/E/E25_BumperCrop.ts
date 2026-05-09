import { fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'
import { E25_BumperCrop } from '../../cards-display/E/E25_BumperCrop'

const CARD_ID = E25_BumperCrop.id

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
