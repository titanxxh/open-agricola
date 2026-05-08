import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'
import { A7_GardenersKnife } from '../../cards-display/A/A7_GardenersKnife'
export { A7_GardenersKnife }

const CARD_ID = A7_GardenersKnife.id

export const A7_GardenersKnife_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const grainFields = player.fields.filter((f) => fieldHasCrop(f, 'grain')).length
    const vegFields = player.fields.filter((f) => fieldHasCrop(f, 'vegetable')).length
    if (grainFields === 0 && vegFields === 0) return
    const params: Record<string, number> = {}
    if (grainFields > 0) params.food = grainFields
    if (vegFields > 0) params.grain = vegFields
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
