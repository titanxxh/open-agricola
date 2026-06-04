import { defineMinorCard } from '../card-source'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'C79_StoneCart'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const evenRounds = [2, 4, 6, 8, 10, 12, 14].filter((r) => r > state.round)
    if (evenRounds.length === 0) return
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: evenRounds.map((round) => ({ round, resources: { stone: 1 } })),
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C79_StoneCart = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Stone Cart",
    deck: "C",
    number: 79,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["Place 1 <STONE> on each remaining even-numbered round space. At the start of these rounds, you get the <STONE>."],
    cost: { wood: 2 },
    prerequisite: "2 Occupations",
    occupationPrerequisites: { min: 2 },
  },
  impl: cardImpl,
})

export const C79_StoneCart_impl = C79_StoneCart.impl
