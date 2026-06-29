import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B001_UpscaleLifestyle'

const cardImpl = {
  effect: {
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
              actionId: 'renovate-house',
              sourceCard: CARD_ID,
            },
          ],
        },
      ],
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B001_UpscaleLifestyle = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Upscale Lifestyle",
    deck: "B",
    number: 1,
    category: "FARM_PLANNER",
    desc: ["You immediately get 5 <CLAY> and a __Renovation__ action. If you take the action, you must pay the renovation cost."],
    cost: { wood: 3 },
    passing: true,
  },
  impl: cardImpl,
})

export const B001_UpscaleLifestyle_impl = B001_UpscaleLifestyle.impl
