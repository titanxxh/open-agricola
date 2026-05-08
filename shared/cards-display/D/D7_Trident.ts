import { MinorImprovement } from '../types'

const CARD_ID = 'D7_Trident'

export const D7_Trident = new MinorImprovement({
  id: CARD_ID,
  name: "Trident",
  deck: "D",
  number: 7,
  category: "FOOD_PROVIDER",
  desc: ["If you play this card in round 3/6/9/12, you immediately get 3/4/5/6 <FOOD>."],
  cost: { wood: 1 },
  passing: true,
  prerequisite: 'Play in Round 3, 6, 9, or 12',
})
