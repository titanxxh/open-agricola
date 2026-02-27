import { MinorImprovement } from '../types'

export const A41_VegetableSlicer = new MinorImprovement({
  id: "A41_VegetableSlicer",
  name: "Vegetable Slicer",
  deck: "A",
  number: 41,
  category: "GOODS_PROVIDER",
  desc: ["Each time you upgrade a Fireplace to a Cooking Hearth, you immediately get 2 <WOOD> and 1 <VEGETABLE> (not retroactively)."],
  cost: {"wood":1},
})
