import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { B65_GrainDepot } from '../../cards-display/B/B65_GrainDepot'

const CARD_ID = B65_GrainDepot.id

export const B65_GrainDepot_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player, paymentInfo) => {
    if (!paymentInfo || paymentInfo.feeIndex === undefined) return

    // altCosts order: [{ wood: 2 }, { clay: 2 }, { stone: 2 }]
    // wood → 2 rounds, clay → 3 rounds, stone → 4 rounds
    const roundsByFee = [2, 3, 4]
    const rounds = roundsByFee[paymentInfo.feeIndex]
    if (!rounds) return

    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: rounds,
      resources: { grain: 1 },
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
