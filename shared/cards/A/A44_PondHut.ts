import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { A44_PondHut } from '../../cards-display/A/A44_PondHut'
export { A44_PondHut }

const CARD_ID = A44_PondHut.id

export const A44_PondHut_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) =>
    queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: 3,
      resources: { food: 1 },
    }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
