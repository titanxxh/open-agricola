import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { B14_Hawktower } from '../../cards-display/B/B14_Hawktower'
export { B14_Hawktower }

const CARD_ID = B14_Hawktower.id

registerPrerequisite('Play in Round 7 or Before', (_player, state) => {
  if (!state) return true
  return state.round <= 7
})

export const B14_Hawktower_impl = {
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
