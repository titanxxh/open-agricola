import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D76_SocialBenefits } from '../../cards-display/D/D76_SocialBenefits'

const CARD_ID = D76_SocialBenefits.id

export const D76_SocialBenefits_impl = {
  effect: {
  id: CARD_ID,
  onEndHarvestFeedingPhase: (_state, player) => {
    if (player.resources.food !== 0) return

    return gainLeaf(CARD_ID, { wood: 1, clay: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
