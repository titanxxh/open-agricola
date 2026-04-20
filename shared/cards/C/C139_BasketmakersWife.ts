import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C139_BasketmakersWife'

export const C139_BasketmakersWife = new Occupation({
  id: CARD_ID,
  name: "Basketmaker's Wife",
  deck: "C",
  number: 139,
  category: "FOOD_PROVIDER",
  desc: ["When you play this card, you immediately get 1 <REED> and 1 <FOOD>. At any time, you can turn 1 <REED> into 2 <FOOD>."],
  players: "3+",
  exchanges: [
    { from: { reed: 1 }, to: { food: 2 }, trigger: 'anytime' },
  ],
  newSet: true,
})

export const C139_BasketmakersWife_impl = {
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
