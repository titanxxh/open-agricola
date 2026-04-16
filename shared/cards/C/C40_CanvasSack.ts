import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C40_CanvasSack'

// BGA: XOR — pay 1 grain to get 1 vegetable, OR pay 1 reed to get 4 wood.
registerCardEffect({
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
})

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
