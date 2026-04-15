import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C9_AutomaticWaterTrough'

// BGA: XOR — choose to buy 1 sheep (free), 1 pig (1 food), or 1 cattle (2 food),
// only if you can accommodate that animal. Simplified: offer all three choices as xor.
registerCardEffect({
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
})

export const C9_AutomaticWaterTrough = new MinorImprovement({
  id: CARD_ID,
  name: "Automatic Water Trough",
  deck: "C",
  number: 9,
  category: "ANIMAL_HANDLER",
  desc: ["If you can accommodate the animal, you can immediately buy 1 <SHEEP>/<PIG>/<CATTLE> for 0/1/2 <FOOD>."],
  cost: { wood: 1 },
  passing: true,
  newSet: true,
})
