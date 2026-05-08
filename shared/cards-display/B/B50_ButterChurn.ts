import { MinorImprovement } from '../types'

const CARD_ID = 'B50_ButterChurn'

export const B50_ButterChurn = new MinorImprovement({
  id: CARD_ID,
  name: "Butter Churn",
  deck: "B",
  number: 50,
  category: "FOOD_PROVIDER",
  desc: ["In the field phase of each harvest, you get 1 <FOOD> for every 3 <SHEEP> and 1 <FOOD> for every 2 <CATTLE> you have."],
  vp: 1,
  cost: { wood: 1 },
  prerequisite: "At Most 3 Occupations",
  occupationPrerequisites: { max: 3 },
})
