import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D32_WoodRake'

registerCardEffect({
  id: CARD_ID,
  onBeforeHarvest: (state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    if (state.round !== 14) return

    // Count all crop tokens in all fields before final harvest
    let totalCrops = 0
    for (const field of player.fields) {
      if (field.crop && field.remaining > 0) {
        totalCrops += field.remaining
      }
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
