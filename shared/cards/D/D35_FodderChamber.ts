import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D35_FodderChamber'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    const totalAnimals = player.resources.sheep + player.resources.boar + player.resources.cattle
    const thresholds = [0, 7, 7, 5, 4, 3]
    const threshold = thresholds[state.players.length] ?? 7
    return Math.max(0, totalAnimals - threshold + 1)
  },
})

export const D35_FodderChamber = new MinorImprovement({
  id: CARD_ID,
  name: "Fodder Chamber",
  deck: "D",
  number: 35,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each animal beyond a threshold based on the number of players."],
  cost: { wood: 1, clay: 1 },
})
