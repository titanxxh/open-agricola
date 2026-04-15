import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B9_BeatingRod'

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'xor' as const,
    children: [
      gainLeaf(CARD_ID, { reed: 1 }),
      {
        type: 'seq' as const,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { reed: 1 } }),
          gainLeaf(CARD_ID, { cattle: 1 }),
        ],
      },
    ],
  }),
})

export const B9_BeatingRod = new MinorImprovement({
  id: CARD_ID,
  name: "Beating Rod",
  deck: "B",
  number: 9,
  category: "ANIMAL_HANDLER",
  desc: ["You can immediately choose to either get 1 <REED> or exchange 1 <REED> for 1 <CATTLE>."],
  cost: { wood: 1 },
  passing: true,
})
