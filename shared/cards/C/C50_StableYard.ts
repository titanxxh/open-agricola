import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C50_StableYard'

export const C50_StableYard = new MinorImprovement({
  id: CARD_ID,
  name: "Stable Yard",
  deck: "C",
  number: 50,
  category: "FOOD_PROVIDER",
  desc: ["When you play this card, you immediately get 1 <FOOD> for each completed round left to play. At any time, you can exchange 1 <SHEEP> plus 1 <PIG> for 1 <CATTLE>."],
  vp: 1,
  prerequisite: "3 Stables and 3 Pastures",
  exchanges: [
    { from: { sheep: 1, boar: 1 }, to: { cattle: 1 }, triggers: ['anytime'] },
  ],
  newSet: true,
})

export const C50_StableYard_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, _player) => {
    const n = 14 - state.round
    if (n <= 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { food: n },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
