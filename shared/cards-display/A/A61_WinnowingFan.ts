import { MinorImprovement } from '../types'

const CARD_ID = 'A61_WinnowingFan'

export const A61_WinnowingFan = new MinorImprovement({
  id: CARD_ID,
  name: "Winnowing Fan",
  deck: "A",
  number: 61,
  category: "FOOD_PROVIDER",
  desc: ["After the field phase of each harvest, you can use a <BAKE>-improvement but only to turn exactly 1 <GRAIN> into <FOOD>. (This is not considered a __Bake Bread__ action.)"],
  cost: { reed: 1 },
  prerequisite: "Baking Improvement",
})
