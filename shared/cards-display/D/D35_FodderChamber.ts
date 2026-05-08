import { MinorImprovement } from '../types'

const CARD_ID = 'D35_FodderChamber'

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
