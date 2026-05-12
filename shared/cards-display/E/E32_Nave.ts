import { MinorImprovement } from '../types'

const CARD_ID = 'E32_Nave'

export const E32_Nave = new MinorImprovement({
  id: CARD_ID,
  name: "Nave",
  deck: "E",
  number: 32,
  category: "BONUS_POINTS_-_GET",
  desc: ['During scoring, you get 1 bonus <SCORE> for each of the 5 columns of your farmyard board containing at least one room.'],
  cost: { stone: 2, reed: 1 },
  vp: 0,
  extraVp: true,
})
