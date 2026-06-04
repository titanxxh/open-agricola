import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'C139_BasketmakersWife'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { reed: 1, food: 1 },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C139_BasketmakersWife = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Basketmaker's Wife",
    deck: "C",
    number: 139,
    category: "FOOD_PROVIDER",
    desc: ["When you play this card, you immediately get 1 <REED> and 1 <FOOD>. At any time, you can turn 1 <REED> into 2 <FOOD>."],
    players: "3+",
    waresSalesmanGains: [{ reed: 2 }],
    exchanges: [
        { from: { reed: 1 }, to: { food: 2 }, triggers: ['anytime'] },
      ],
  },
  impl: cardImpl,
})

export const C139_BasketmakersWife_impl = C139_BasketmakersWife.impl
