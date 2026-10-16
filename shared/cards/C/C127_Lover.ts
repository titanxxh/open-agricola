import { defineOccupationCard } from '../card-source'
import { individualFoodCostRequest } from '../../actions/helpers/individual-food-cost'
import type { CardImpl } from '../registry'

const CARD_ID = 'C127_Lover'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, _player) => {
    const roundsLeft = 14 - state.round
    if (roundsLeft < 0) return
    return {
      type: 'seq' as const,
      children: [
        { type: 'leaf' as const, actionId: 'individual-food-cost', sourceCard: CARD_ID, params: { food: roundsLeft } },
        {
          type: 'leaf' as const,
          actionId: 'family-growth',
          sourceCard: CARD_ID,
          actionContext: { skipRoomCheck: true },
        },
      ],
    }
  },
  projectInteractionRequest: (state, player, request, actionId) =>
    actionId === 'individual-food-cost' && request.kind === 'choice'
      ? individualFoodCostRequest(player, 14 - state.round)
      : request,
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C127_Lover = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Lover",
    deck: "C",
    number: 127,
    category: "FARM_PLANNER",
    desc: ["When you play this card, immediately pay an amount of <FOOD> equal to the number of complete rounds left to play to take a __Family Growth Even without Room__ action."],
    players: "3+",
  },
  impl: cardImpl,
})

export const C127_Lover_impl = C127_Lover.impl
