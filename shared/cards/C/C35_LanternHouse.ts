import type { CardImpl } from '../registry'
import { C35_LanternHouse } from '../../cards-display/C/C35_LanternHouse'
export { C35_LanternHouse }

const CARD_ID = C35_LanternHouse.id

export const C35_LanternHouse_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return -(player.minorHand.length + player.occupationHand.length)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
