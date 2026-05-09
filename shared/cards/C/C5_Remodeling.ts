import { collectCardsAs } from '../helpers/card-type'
import type { CardImpl } from '../registry'
import { C5_Remodeling } from '../../cards-display/C/C5_Remodeling'

const CARD_ID = C5_Remodeling.id

export const C5_Remodeling_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const clayRooms = player.houseType === 'clay' ? player.rooms : 0
    const majorCount = collectCardsAs(player, 'major').length
    const total = clayRooms + majorCount
    if (total === 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { clay: total },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
