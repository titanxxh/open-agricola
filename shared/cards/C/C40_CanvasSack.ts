import { MinorImprovement } from '../types'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C40_CanvasSack'

export const C40_CanvasSack = new MinorImprovement({
  id: CARD_ID,
  name: "Canvas Sack",
  deck: "C",
  number: 40,
  category: "GOODS_PROVIDER",
  desc: ["When you play this card paying <GRAIN>/<REED> for it, you immediately get 1 <VEGETABLE>/4 <WOOD>."],
  vp: 1,
  prerequisite: "No Occupations",
  occupationPrerequisites: { max: 0 },
})

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
