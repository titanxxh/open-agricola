import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { incCounter } from '../__stubs__/helpers'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'B65_GrainDepot'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    let rounds = 2
    if (player.resources.clay > 0 || player.resources.stone > 0) {
      rounds = player.resources.stone > 0 ? 4 : 3
    }
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: rounds,
      resources: { grain: 1 },
    })
    incCounter(player, CARD_ID, 'triggerCount')
    return futureMeeplesNode()
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
})
