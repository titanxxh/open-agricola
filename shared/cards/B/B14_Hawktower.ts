import { defineMinorCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'B14_Hawktower'

const cardImpl = {
  prerequisiteCheck: (_player, state) => {
    if (!state) return true
    return state.round <= 7
  },
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [{ round: 12, roomType: 'stone' }],
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B14_Hawktower = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Hawktower',
    deck: 'B',
    number: 14,
    category: 'FARM_PLANNER',
    desc: ['Place a stone room on round space 12. If you live in a stone house at the start of the round, you can build the stone room at no cost. Otherwise, discard the stone room.'],
    cost: { clay: 2 },
    prerequisite: 'Play in Round 7 or Before',
  },
  impl: cardImpl,
})

export const B14_Hawktower_impl = B14_Hawktower.impl
