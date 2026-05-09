import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C29_BeerTable'

export const C29_BeerTable_impl = {
  effect: {
  id: CARD_ID,
  onEndHarvestFieldPhase: (_state, player) => {
    if ((player.resources.grain ?? 0) < 1) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'gain', params: { recipientMode: 'others', food: 1 }, sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
