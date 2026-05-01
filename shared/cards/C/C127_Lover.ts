import { Occupation } from '../types'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C127_Lover'

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

export const C127_Lover_impl = {
  effect: {
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
          actionId: 'family-growth',
          sourceCard: CARD_ID,
          actionContext: { skipRoomCheck: true },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
