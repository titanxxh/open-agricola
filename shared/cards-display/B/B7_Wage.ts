import { MinorImprovement } from '../types'

const CARD_ID = 'B7_Wage'

export const B7_Wage = new MinorImprovement({
  id: CARD_ID,
  name: "Wage",
  deck: "B",
  number: 7,
  category: "FOOD_PROVIDER",
  desc: ["You immediately get 2 <FOOD> and 1 additional <FOOD> for each major improvement you have from the bottom row of the supply board."],
  passing: true,
})
