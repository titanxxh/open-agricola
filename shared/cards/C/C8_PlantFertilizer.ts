import { fieldHasCrop, fieldIsEmpty, fieldTotalRemaining } from '../../domain/field'
import type { CardImpl } from '../registry'
import { C8_PlantFertilizer } from '../../cards-display/C/C8_PlantFertilizer'
export { C8_PlantFertilizer }

const CARD_ID = C8_PlantFertilizer.id

export const C8_PlantFertilizer_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const eligibleFields = player.fields.filter((f) => !fieldIsEmpty(f) && fieldTotalRemaining(f) === 1)
    const grainCount = eligibleFields.filter((f) => fieldHasCrop(f, 'grain')).length
    const vegCount = eligibleFields.filter((f) => fieldHasCrop(f, 'vegetable')).length
    if (grainCount === 0 && vegCount === 0) return
    const params: Record<string, number> = {}
    if (grainCount > 0) params.grain = grainCount
    if (vegCount > 0) params.vegetable = vegCount
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
