import type { CardImpl } from '../registry'
import { E153_StoneSculptor } from '../../cards-display/E/E153_StoneSculptor'
export { E153_StoneSculptor }

const CARD_ID = E153_StoneSculptor.id

export const E153_StoneSculptor_impl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player): number => {
      const earned = player.cardStates?.[CARD_ID]?.extraData?.bonusVpEarned
      return typeof earned === 'number' ? earned : 0
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
