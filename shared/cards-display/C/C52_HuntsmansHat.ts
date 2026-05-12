import { MinorImprovement } from '../types'

const CARD_ID = 'C52_HuntsmansHat'

export const C52_HuntsmansHat = new MinorImprovement({
  id: CARD_ID,
  name: "Huntsman's Hat",
  deck: "C",
  number: 52,
  category: "FOOD_PROVIDER",
  desc: ["For each new <PIG> you get from the effect of an action space, you also get 1 <FOOD>."],
  vp: 1,
  cost: { reed: 1 },
  prerequisite: "Cooking Improvement",
})
