import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C40_CanvasSack } from '../../cards-display/C/C40_CanvasSack'
export { C40_CanvasSack }

const CARD_ID = C40_CanvasSack.id

export const C40_CanvasSack_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return {
      type: 'xor' as const,
      children: [
        {
          type: 'seq' as const,
          children: [
            payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
            gainLeaf(CARD_ID, { vegetable: 1 }),
          ],
        },
        {
          type: 'seq' as const,
          children: [
            payLeaf({ cardId: CARD_ID, cost: { reed: 1 } }),
            gainLeaf(CARD_ID, { wood: 4 }),
          ],
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
