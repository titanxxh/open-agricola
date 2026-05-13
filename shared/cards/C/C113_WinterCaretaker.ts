import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C113_WinterCaretaker } from '../../cards-display/C/C113_WinterCaretaker'

const CARD_ID = C113_WinterCaretaker.id

export const C113_WinterCaretaker_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { grain: 1 }),
  onEndHarvest: (_state, player) => {
    if (player.resources.food < 2) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: 2 },
        }),
        gainLeaf(CARD_ID, { vegetable: 1 }),
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
