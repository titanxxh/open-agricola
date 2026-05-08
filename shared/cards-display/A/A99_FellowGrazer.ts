import { Occupation } from '../types'

const CARD_ID = 'A99_FellowGrazer'

export const A99_FellowGrazer = new Occupation({
  id: CARD_ID,
  name: "Fellow Grazer",
  deck: "A",
  number: 99,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 2 bonus <SCORE> for each pasture you have covering at least 3 farmyard spaces."],
  cost: {},
  players: "1+",
  extraVp: true,
})
