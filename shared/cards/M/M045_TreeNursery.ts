import { defineMinorCard } from '../card-source'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'M045_TreeNursery'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => futureMeeplesNode({
      cardId: CARD_ID,
      playerId: player.id,
      entries: [
        { round: 12, resources: { forest: 1 } },
        { round: 13, resources: { forest: 1 } },
      ],
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M045_TreeNursery = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Tree Nursery",
    deck: "M",
    number: 45,
    category: "FARM_PLANNER",
    desc: [
        "Place 1 forest each on the round spaces 12 and 13. At the start of these rounds, you can place the forest on an unused farmyard space."
    ],
    cost: {
        "wood": 1
    },
    prerequisite: "No Improvements",
    improvementPrerequisites: { max: 0 },
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M045_TreeNursery_impl = M045_TreeNursery.impl
