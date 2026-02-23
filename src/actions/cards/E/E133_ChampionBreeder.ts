import { Occupation } from '../types'

export const E133_ChampionBreeder = new Occupation({
  id: "E133_ChampionBreeder",
  name: "Champion Breeder",
  deck: "E",
  number: 133,
  desc: ["Each time you place 2 or 3+ newborn animals on your farm during the breeding phase of the harvest, you get 1 or 2 bonus <SCORE>, respectively."],
  cost: {},
  players: "3+",
})
