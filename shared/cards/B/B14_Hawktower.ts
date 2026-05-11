import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { B14_Hawktower } from '../../cards-display/B/B14_Hawktower'

const CARD_ID = B14_Hawktower.id

export const B14_Hawktower_impl = {
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
