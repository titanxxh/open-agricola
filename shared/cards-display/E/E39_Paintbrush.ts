import { MinorImprovement } from '../types'

const CARD_ID = 'E39_Paintbrush'

export const E39_Paintbrush = new MinorImprovement({
  id: CARD_ID,
  name: "Paintbrush",
  deck: "E",
  number: 39,
  category: "BONUS_POINTS_-_GET",
  desc: ["Each harvest, you can exchange exactly 1 <CLAY> for your choice of 2 <FOOD> or 1 bonus <SCORE>."],
  cost: { wood: 1 },
  prerequisite: "1 Pig",
  extraVp: true,
})
