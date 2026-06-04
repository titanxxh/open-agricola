import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'C83_EarlyCattle'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { cattle: 2 },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C83_EarlyCattle = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Early Cattle",
    deck: "C",
    number: 83,
    category: "LIVESTOCK_PROVIDER",
    desc: ["When you play this card, you immediately get 2 <CATTLE>."],
    vp: -3,
    prerequisite: "1 Pasture",
  },
  impl: cardImpl,
})

export const C83_EarlyCattle_impl = C83_EarlyCattle.impl
