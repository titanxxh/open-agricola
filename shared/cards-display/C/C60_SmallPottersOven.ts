import { MinorImprovement } from '../types'

const CARD_ID = 'C60_SmallPottersOven'

export const C60_SmallPottersOven = new MinorImprovement({
  id: CARD_ID,
  name: "Small Potter's Oven",
  deck: "C",
  number: 60,
  category: "FOOD_PROVIDER",
  desc: [
    "When you play this card, you immediately get 5 <FOOD>. Each time before you get a __Bake Bread__ action, you can build the __Clay Oven__ or __Stone Oven__ major improvement.",
  ],
  vp: 5,
  cost: { clay: 2 },
  prerequisite: "Return the Clay / Stone Oven",
  alsoCountsAs: ['major'],
})
