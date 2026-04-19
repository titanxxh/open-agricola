import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { fieldTotalRemaining } from '../../game/field'

const CARD_ID = 'D32_WoodRake'

registerCardEffect({
  id: CARD_ID,
  onBeforeHarvest: (state, player) => {
    if (state.round !== 14) return

    // Count all crop tokens in all fields before final harvest
    let totalCrops = 0
    for (const field of player.fields) {
      totalCrops += fieldTotalRemaining(field)
    }
    if (totalCrops < 7) return

    return {
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
      ],
    }
  },
})

export const D32_WoodRake = new MinorImprovement({
  id: CARD_ID,
  name: "Wood Rake",
  deck: "D",
  number: 32,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, if you had at least 7 goods in your fields before the final harvest, you get 2 bonus <SCORE>."],
  cost: { wood: 1 },
})
