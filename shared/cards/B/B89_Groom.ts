import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B89_Groom } from '../../cards-display/B/B89_Groom'

const CARD_ID = B89_Groom.id

export const B89_Groom_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => {
    return gainLeaf(CARD_ID, { wood: 1 })
  },
  onBeforeStartOfTurn: (_state, player) => {
    if (player.houseType !== 'stone') return
    return {
      type: 'leaf' as const,
      actionId: 'stables',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        max: 1,
        exactCost: { wood: 1, max: 1 },
      },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
