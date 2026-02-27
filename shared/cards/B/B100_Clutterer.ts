import { Occupation } from '../types'

export const B100_Clutterer = new Occupation({
  id: "B100_Clutterer",
  name: "Clutterer",
  deck: "B",
  number: 100,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each card played after this one that has \"accumulation space(s)\" in its text."],
  cost: {},
  players: "1+",
})
