import { defineMinorCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'B065_GrainDepot'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player, paymentInfo) => {
    const pathIndex = paymentInfo?.originalFeeIndex ?? paymentInfo?.feeIndex
    if (pathIndex === undefined) return

    // altCosts order: [{ wood: 2 }, { clay: 2 }, { stone: 2 }]
    // wood → 2 rounds, clay → 3 rounds, stone → 4 rounds
    const roundsByFee = [2, 3, 4]
    const rounds = roundsByFee[pathIndex]
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

export const B065_GrainDepot = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Grain Depot",
    deck: "B",
    number: 65,
    category: "CROP_PROVIDER",
    desc: ["If you paid <WOOD>/<CLAY>/<STONE> for this card, place 1 <GRAIN> on each of the next 2/3/4 round spaces. At the start of these rounds, you get the <GRAIN>."],
    cost: {},
    altCosts: [{ wood: 2 }, { clay: 2 }, { stone: 2 }],
  },
  impl: cardImpl,
})

export const B065_GrainDepot_impl = B065_GrainDepot.impl
