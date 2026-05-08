import type { CardImpl } from '../registry'
import { A5_ClayEmbankment } from '../../cards-display/A/A5_ClayEmbankment'
export { A5_ClayEmbankment }

const CARD_ID = A5_ClayEmbankment.id

export const A5_ClayEmbankment_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const clay = player.resources.clay
    if (clay < 2) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { clay: Math.floor(clay / 2) },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
