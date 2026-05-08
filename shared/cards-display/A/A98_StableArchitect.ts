import { Occupation } from '../types'

const CARD_ID = 'A98_StableArchitect'

export const A98_StableArchitect = new Occupation({
  id: CARD_ID,
  name: "Stable Architect",
  deck: "A",
  number: 98,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each unfenced stable in your farmyard."],
  cost: {},
  players: "1+",
  extraVp: true,
})
