import { MinorImprovement } from '../types'

const CARD_ID = 'B53_SculptureCourse'

export const B53_SculptureCourse = new MinorImprovement({
  id: CARD_ID,
  name: "Sculpture Course",
  deck: "B",
  number: 53,
  category: "FOOD_PROVIDER",
  desc: ["At the end of each round that does not end with a harvest, you can use this card to exchange your choice of 1 <WOOD> for 2 <FOOD>, or 1 <STONE> for 4 <FOOD>."],
  cost: { grain: 1 },
})
