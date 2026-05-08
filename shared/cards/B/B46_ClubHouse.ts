import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { B46_ClubHouse } from '../../cards-display/B/B46_ClubHouse'
export { B46_ClubHouse }

const CARD_ID = B46_ClubHouse.id

export const B46_ClubHouse_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const base = state.round
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [
        { round: base + 1, resources: { food: 1 } },
        { round: base + 2, resources: { food: 1 } },
        { round: base + 3, resources: { food: 1 } },
        { round: base + 4, resources: { food: 1 } },
        { round: base + 5, resources: { stone: 1 } },
      ],
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
