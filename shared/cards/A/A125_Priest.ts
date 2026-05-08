import type { CardImpl } from '../registry'
import { A125_Priest } from '../../cards-display/A/A125_Priest'

const CARD_ID = A125_Priest.id

export const A125_Priest_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    if (player.rooms !== 2 || player.houseType !== 'clay') return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { clay: 3, reed: 2, stone: 2 },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
