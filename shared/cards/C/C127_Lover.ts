import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C127_Lover'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, _player) => {
    const roundsLeft = 14 - state.round
    if (roundsLeft <= 0) return
    return {
      type: 'seq' as const,
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: roundsLeft } }),
        {
          type: 'leaf' as const,
          actionId: 'grow-family-without-room',
          sourceCard: CARD_ID,
        },
      ],
    }
  },
})

export const C127_Lover = new Occupation({
  id: CARD_ID,
  name: "Lover",
  deck: "C",
  number: 127,
  category: "FARM_PLANNER",
  desc: ["When you play this card, immediately pay an amount of <FOOD> equal to the number of complete rounds left to play to take a __Family Growth Even without Room__ action."],
  players: "3+",
  newSet: true,
})
