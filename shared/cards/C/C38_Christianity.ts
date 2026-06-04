import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'C38_Christianity'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { recipientMode: 'others', food: 1 },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C38_Christianity = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Christianity",
    deck: "C",
    number: 38,
    category: "POINTS_PROVIDER",
    desc: ["When you play this card, all other players get 1 <FOOD> each."],
    vp: 2,
    prerequisite: "Exactly 1 Sheep",
  },
  impl: cardImpl,
})

export const C38_Christianity_impl = C38_Christianity.impl
