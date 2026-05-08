import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { B41_Hauberg } from '../../cards-display/B/B41_Hauberg'
export { B41_Hauberg }

const CARD_ID = B41_Hauberg.id

export const B41_Hauberg_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const base = state.round
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [
        { round: base + 1, resources: { wood: 2 } },
        { round: base + 2, resources: { boar: 1 } },
        { round: base + 3, resources: { wood: 2 } },
        { round: base + 4, resources: { boar: 1 } },
      ],
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
