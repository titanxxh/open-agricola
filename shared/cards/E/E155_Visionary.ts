import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E155_Visionary'

registerCardEffect({
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
})

export const E155_Visionary = new Occupation({
  id: CARD_ID,
  name: 'Visionary',
  deck: 'E',
  number: 155,
  category: 'FOOD_MISC',
  desc: ['If you play this card in round 4 or before, you get 1 <STONE>, 1 <VEGETABLE>, and 2 <PIG>. You cannot grow your family until round 11, unless all other players already have.'],
  players: '4+',
})
