import { MinorImprovement } from '../types'

const CARD_ID = 'C33_GreeningPlan'

export const C33_GreeningPlan = new MinorImprovement({
  id: CARD_ID,
  name: "Greening Plan",
  deck: "C",
  number: 33,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, if you then have at least 2/4/5/6 unplanted fields, you get 1/2/3/5 bonus <SCORE>."],
  cost: { food: 3 },
  extraVp: true,
})
