import { defineMinorCard } from '../card-source'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'M049_SurveyorsMap'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => futureMeeplesNode({
      cardId: CARD_ID,
      playerId: player.id,
      entries: [
        { round: 11, resources: { field: 1 } },
        { round: 12, resources: { moor: 1 } },
        { round: 13, resources: { forest: 1 } },
      ],
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M049_SurveyorsMap = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Surveyor's Map",
    deck: "M",
    number: 49,
    category: "FARM_PLANNER",
    desc: [
        "Place a <FIELD> tile on round space 11, a <MOOR> on round space 12, and a <FOREST> on round space 13. At the start of these rounds, you can place the respective tile on an unused farmyard space per the normal rules."
    ],
    cost: {
        "vegetable": 2
    },
    prerequisite: "Play in Round 2 or Before",
    maxRound: 2,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M049_SurveyorsMap_impl = M049_SurveyorsMap.impl
