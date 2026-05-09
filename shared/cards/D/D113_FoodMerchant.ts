import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'
import { D113_FoodMerchant } from '../../cards-display/D/D113_FoodMerchant'

const CARD_ID = D113_FoodMerchant.id

export const D113_FoodMerchant_impl = {
  effect: {
  id: CARD_ID,
  onAfterReap: (_state, player) => {
    // Count grain fields that were harvested
    const grainFields = player.fields.filter(f => fieldHasCrop(f, 'grain'))
    // Check harvestReapSummary for grain fields harvested
    const grainHarvested = _state.harvestReapSummary?.[player.id]?.grainFields ?? 0
    if (grainHarvested <= 0) return
    if (player.resources.food < 2) return
    // Determine cheapest cost: 2 food if any grain field is now empty (remaining === 0), else 3
    // A grain field that was harvested and is now empty means remaining went to 0 and crop was set to null.
    // After reap, fields with remaining === 0 have crop set to null.
    // So we check: any field that had grain and now has remaining === 0 (just harvested last grain).
    // But reap() sets crop to null when remaining hits 0, so we can't check crop === 'grain' for empty fields.
    // Instead, check the summary: if grainHarvested > grainFields.length, some fields were depleted.
    // Actually: grainFields are fields that STILL have crop === 'grain' (they have remaining > 0 after harvest).
    // So if grainHarvested > grainFields.length, at least one grain field was depleted.
    const hasDepletedGrainField = grainHarvested > grainFields.length
    const cost = hasDepletedGrainField ? 2 : 3
    if (player.resources.food < cost) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: cost } }),
        gainLeaf(CARD_ID, { vegetable: 1 }),
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
