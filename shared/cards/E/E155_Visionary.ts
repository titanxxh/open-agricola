import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E155_Visionary'

export const E155_Visionary = new Occupation({
  id: CARD_ID,
  name: 'Visionary',
  deck: 'E',
  number: 155,
  category: 'GOODS_-_GET',
  desc: ['If you play this card in round 4 or before, you get 1 <STONE>, 1\u00a0<VEGETABLE>, and 2 <PIG>. You cannot grow your family until round 11, unless all other players already have.'],
  players: '4+',
})

export const E155_Visionary_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state) => {
    if (state.round <= 4) {
      return {
        type: 'leaf' as const,
        actionId: 'gain',
        sourceCard: CARD_ID,
        params: { stone: 1, vegetable: 1, boar: 2 },
      }
    }
  },
  // TODO: implement family growth restriction until round 11
  // (unless all other players already have more family members).
},
  reaches: [] as readonly string[],
} satisfies CardImpl
