import { getStoneHouseBonusScore } from '../helpers/stone-house-bonus'
import type { CardImpl } from '../registry'
import { D34_LuxuriousHostel } from '../../cards-display/D/D34_LuxuriousHostel'
export { D34_LuxuriousHostel }

const CARD_ID = D34_LuxuriousHostel.id

export const D34_LuxuriousHostel_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return getStoneHouseBonusScore(player, CARD_ID)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
