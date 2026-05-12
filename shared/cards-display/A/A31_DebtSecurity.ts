import { MinorImprovement } from '../types'

const CARD_ID = 'A31_DebtSecurity'

export const A31_DebtSecurity = new MinorImprovement({
  id: CARD_ID,
  name: "Debt Security",
  deck: "A",
  number: 31,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each major improvement you have, up to the number of your unused farmyard spaces."],
  cost: { food: 2 },
  extraVp: true,
})
