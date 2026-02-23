import { MinorImprovement } from '../types'

export const C52_HuntsmansHat = new MinorImprovement({
  id: "C52_HuntsmansHat",
  name: "Huntsman's Hat",
  deck: "C",
  number: 52,
  category: "FOOD_PROVIDER",
  desc: [
    "For each new <BOAR> you get from the effect of an action space, you also get 1 <FOOD>.",
  ],
  cost: { reed: 1 },
  prerequisite: "Cooking Improvement",
  newSet: true,
})
