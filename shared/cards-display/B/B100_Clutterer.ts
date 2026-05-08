import { Occupation } from '../types'

const CARD_ID = 'B100_Clutterer'

export const B100_Clutterer = new Occupation({
  id: CARD_ID,
  name: "Clutterer",
  deck: "B",
  number: 100,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each card played after this one that has \"accumulation space(s)\" in its text."],
  cost: {},
  players: "1+",
})
