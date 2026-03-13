import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { incCounter } from '../__stubs__/helpers'
import { queueFutureMeeples } from '../../actions/effects/future-meeples'

const CARD_ID = 'B65_GrainDepot'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player, paymentInfo) => {
    if (!paymentInfo || paymentInfo.feeIndex === undefined) return

    // altCosts order: [{ wood: 2 }, { clay: 2 }, { stone: 2 }]
    // wood → 2 rounds, clay → 3 rounds, stone → 4 rounds
    const roundsByFee = [2, 3, 4]
    const rounds = roundsByFee[paymentInfo.feeIndex]
    if (!rounds) return

    incCounter(player, CARD_ID, 'triggerCount')
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: rounds,
      resources: { grain: 1 },
    })
    return { type: 'leaf', actionId: 'future-meeples' }
  },
})

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
