import { defineMinorCard } from '../card-source'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'M044_Swamp'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => futureMeeplesNode({
      cardId: CARD_ID,
      playerId: player.id,
      entries: [{ round: 12, resources: { moor: 1 } }],
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M044_Swamp = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Swamp",
    deck: "M",
    number: 44,
    category: "FARM_PLANNER",
    desc: [
        "Place 1 moor on round space 12. At the start of that round, you can place the moor on an unused farmyard space."
    ],
    cost: {},
    prerequisite: "Play in Round 4 or Before",
    maxRound: 4,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M044_Swamp_impl = M044_Swamp.impl
