import { MinorImprovement } from '../types'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C9_AutomaticWaterTrough'

export const C9_AutomaticWaterTrough = new MinorImprovement({
  id: CARD_ID,
  name: "Automatic Water Trough",
  deck: "C",
  number: 9,
  category: "LIVESTOCK_PROVIDER",
  desc: ["If you can accommodate the animal, you can immediately buy 1 <SHEEP>/<PIG>/<CATTLE> for 0/1/2 <FOOD>."],
  cost: { wood: 1 },
  passing: true,
  newSet: true,
})

export const C9_AutomaticWaterTrough_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return {
      type: 'xor' as const,
      optional: true,
      children: [
        gainLeaf(CARD_ID, { sheep: 1 }),
        {
          type: 'seq' as const,
          children: [
            payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
            gainLeaf(CARD_ID, { boar: 1 }),
          ],
        },
        {
          type: 'seq' as const,
          children: [
            payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
            gainLeaf(CARD_ID, { cattle: 1 }),
          ],
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
