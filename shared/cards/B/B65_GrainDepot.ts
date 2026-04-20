import { MinorImprovement } from '../types'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'B65_GrainDepot'

export const B65_GrainDepot = new MinorImprovement({
  id: CARD_ID,
  name: "Grain Depot",
  deck: "B",
  number: 65,
  category: "CROP_PROVIDER",
  desc: ["If you paid <WOOD>/<CLAY>/<STONE> for this card, place 1 <GRAIN> on each of the next 2/3/4 round spaces. At the start of these rounds, you get the <GRAIN>."],
  cost: {},
  altCosts: [{ wood: 2 }, { clay: 2 }, { stone: 2 }],
})

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
