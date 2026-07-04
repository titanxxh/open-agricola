import { defineOccupationCard } from '../card-source'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B149_OpenAirFarmer'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'seq' as const,
    children: [
      payLeaf({ cardId: CARD_ID, cost: { stable: 3 } }),
      {
        type: 'leaf' as const,
        actionId: 'fence',
        expandFlow: true,
        sourceCard: CARD_ID,
        actionContext: {
          trueAction: false,
          fencePolicy: {
            sourcePolicy: 'ownOnly',
            segmentBounds: { total: { min: 1, max: 6 } },
            newPastureBounds: {
              count: { min: 1, max: 1 },
              totalSize: { min: 2, max: 2 },
            },
            costPolicy: { fence: { wood: 0 }, fixedWood: 2 },
            cancelPolicy: 'forbidCancel',
            pastureBounds: {
              newPastures: { min: 1, max: 1 },
              changedPastures: { min: 1, max: 1 },
              newPastureSize: { min: 2, max: 2 },
            },
          },
        },
      },
    ],
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B149_OpenAirFarmer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Open Air Farmer",
    deck: "B",
    number: 149,
    category: "FARM_PLANNER",
    desc: ['When you play this card, you remove exactly 3 <STABLE> in your supply from play to build a pasture covering 2 farmyard spaces. You only need to pay a total of 2 <WOOD> for <FENCE>'],
    cost: {},
    players: "4+",
  },
  impl: cardImpl,
})

export const B149_OpenAirFarmer_impl = B149_OpenAirFarmer.impl
