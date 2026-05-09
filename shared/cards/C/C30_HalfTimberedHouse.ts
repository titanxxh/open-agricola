import { getStoneHouseBonusScore } from '../helpers/stone-house-bonus'
import type { CardImpl } from '../registry'
import { C30_HalfTimberedHouse } from '../../cards-display/C/C30_HalfTimberedHouse'

const CARD_ID = C30_HalfTimberedHouse.id

export const C30_HalfTimberedHouse_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return getStoneHouseBonusScore(player, CARD_ID)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
