import { Occupation } from '../types'

const CARD_ID = 'E133_ChampionBreeder'

export const E133_ChampionBreeder = new Occupation({
  id: CARD_ID,
  name: "Champion Breeder",
  deck: "E",
  number: 133,
  desc: ["Each time you place 2 or 3+ newborn animals on your farm during the breeding phase of the harvest, you get 1 or 2 bonus <SCORE>, respectively."],
  cost: {},
  players: "3+",
  extraVp: true,
  category: 'BONUS_POINTS',
})
