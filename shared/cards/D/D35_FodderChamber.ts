import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D35_FodderChamber'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    const totalAnimals = player.resources.sheep + player.resources.boar + player.resources.cattle
    const divisors = [7, 5, 4, 3, 3, 3]
    const divisor = divisors[state.players.length - 1] ?? 3
    return Math.floor(totalAnimals / divisor)
  },
})

export const D35_FodderChamber = new MinorImprovement({
  id: CARD_ID,
  name: "Fodder Chamber",
  deck: "D",
  number: 35,
  category: "POINTS_PROVIDER",
  desc: ['During scoring in a game with 1/2/3/4+ players, you get 1 bonus <SCORE> for every 7th/5th/4th/3rd animal on your farm.'],
  cost: { stone: 3, grain: 3 },
  vp: 2,
})
