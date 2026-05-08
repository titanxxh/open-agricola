import type { CardImpl } from '../registry'
import { B32_Kettle } from '../../cards-display/B/B32_Kettle'
export { B32_Kettle }

const CARD_ID = B32_Kettle.id

export const B32_Kettle_impl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player): number => {
      const earned = player.cardStates?.[CARD_ID]?.extraData?.bonusVpEarned
      return typeof earned === 'number' ? earned : 0
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
