import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { B125_EstateWorker } from '../../cards-display/B/B125_EstateWorker'
export { B125_EstateWorker }

const CARD_ID = B125_EstateWorker.id

export const B125_EstateWorker_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const base = state.round
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [
        { round: base + 1, resources: { wood: 1 } },
        { round: base + 2, resources: { clay: 1 } },
        { round: base + 3, resources: { reed: 1 } },
        { round: base + 4, resources: { stone: 1 } },
      ],
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
