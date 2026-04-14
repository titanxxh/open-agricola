import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B1_UpscaleLifestyle'

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'seq' as const,
    children: [
      gainLeaf(CARD_ID, { clay: 5 }),
      {
        type: 'seq' as const,
        optional: true,
        children: [
          {
            type: 'leaf' as const,
            actionId: 'renovation',
            sourceCard: CARD_ID,
          },
        ],
      },
    ],
  }),
})

export const B1_UpscaleLifestyle = new MinorImprovement({
  id: CARD_ID,
  name: "Upscale Lifestyle",
  deck: "B",
  number: 1,
  category: "FARM_PLANNER",
  desc: ["You immediately get 5 <CLAY> and a __Renovation__ action. If you take the action, you must pay the renovation cost."],
  cost: { wood: 3 },
  passing: true,
})
