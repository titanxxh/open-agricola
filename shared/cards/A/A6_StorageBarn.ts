import type { CardImpl } from '../registry'
import { A6_StorageBarn } from '../../cards-display/A/A6_StorageBarn'
export { A6_StorageBarn }

const CARD_ID = A6_StorageBarn.id

export const A6_StorageBarn_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const gains: Record<string, number> = {}
    if (player.improvements.includes('Major_Well')) gains.stone = 1
    if (player.improvements.includes('Major_Joinery')) gains.wood = 1
    if (player.improvements.includes('Major_Pottery')) gains.clay = 1
    if (player.improvements.includes('Major_Basket')) gains.reed = 1
    if (Object.keys(gains).length === 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: gains,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
