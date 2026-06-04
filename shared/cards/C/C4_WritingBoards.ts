import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'C4_WritingBoards'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const count = player.occupationPlayed.length
    if (count === 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { wood: count },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C4_WritingBoards = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Writing Boards",
    deck: "C",
    number: 4,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["You immediately get 1 <WOOD> for each occupation you have in front of you."],
    cost: { food: 1 },
    passing: true,
  },
  impl: cardImpl,
})

export const C4_WritingBoards_impl = C4_WritingBoards.impl
