import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C98_CubeCutter } from '../../cards-display/C/C98_CubeCutter'

const CARD_ID = C98_CubeCutter.id

export const C98_CubeCutter_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 1 }),
  onHarvestFieldPhase: (_state, player) => {
    if (player.resources.wood < 1 || player.resources.food < 1) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { wood: 1, food: 1 } }),
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
