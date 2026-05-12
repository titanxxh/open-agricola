import { MinorImprovement } from '../types'

const CARD_ID = 'C47_GardenClaw'

export const C47_GardenClaw = new MinorImprovement({
  id: CARD_ID,
  name: "Garden Claw",
  deck: "C",
  number: 47,
  category: "FOOD_PROVIDER",
  desc: ["Place 1 <FOOD> on each remaining round space, up to three times the number of planted fields you have. At the start of these rounds, you get the <FOOD>."],
  cost: { wood: 1 },
})
