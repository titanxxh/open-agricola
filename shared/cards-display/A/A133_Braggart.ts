import { Occupation } from '../types'

const CARD_ID = 'A133_Braggart'

export const A133_Braggart = new Occupation({
  id: CARD_ID,
  name: "Braggart",
  deck: "A",
  number: 133,
  category: "POINTS_PROVIDER",
  desc: ["During the scoring, you get 2/3/4/5/7/9 bonus <SCORE> for having at least 5/6/7/8/9/10 improvements in front of you."],
  cost: {},
  players: "1+",
  extraVp: true,
})
