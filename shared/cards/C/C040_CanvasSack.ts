import { defineMinorCard } from '../card-source'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C040_CanvasSack'

const cardImpl = {
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

export const C040_CanvasSack = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Canvas Sack",
    deck: "C",
    number: 40,
    category: "GOODS_PROVIDER",
    desc: ["When you play this card paying <GRAIN>/<REED> for it, you immediately get 1 <VEGETABLE>/4 <WOOD>."],
    altCosts: [{ grain: 1 }, { reed: 1 }],
    vp: 1,
    prerequisite: "No Occupations",
    occupationPrerequisites: { max: 0 },
  },
  impl: cardImpl,
})

export const C040_CanvasSack_impl = C040_CanvasSack.impl
