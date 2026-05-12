import { Occupation } from '../types'

const CARD_ID = 'A134_FullFarmer'

export const A134_FullFarmer = new Occupation({
  id: CARD_ID,
  name: "Full Farmer",
  deck: "A",
  number: 134,
  category: "POINTS_PROVIDER",
  desc: ["When you play this card, you immediately get 1 <WOOD> and 1 <CLAY>. During scoring, you get 1 bonus <SCORE> for each pasture you have holding the maximum number of animals."],
  cost: {},
  players: "3+",
  extraVp: true,
})
