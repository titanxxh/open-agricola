import { fieldTotalRemaining } from '../../domain/field'
import type { CardImpl } from '../registry'
import { D32_WoodRake } from '../../cards-display/D/D32_WoodRake'

const CARD_ID = D32_WoodRake.id

export const D32_WoodRake_impl = {
  effect: {
  id: CARD_ID,
  onBeforeHarvest: (state, player) => {
    if (state.round !== 14) return

    // Count all crop tokens in all fields before final harvest
    let totalCrops = 0
    for (const field of player.fields) {
      totalCrops += fieldTotalRemaining(field)
    }
    if (totalCrops < 7) return

    return {
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
