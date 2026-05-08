import { MinorImprovement } from '../types'

const CARD_ID = 'C71_SlurrySpreader'

export const C71_SlurrySpreader = new MinorImprovement({
  id: CARD_ID,
  name: "Slurry Spreader",
  deck: "C",
  number: 71,
  category: "CROP_PROVIDER",
  desc: ["In the breeding phase of each harvest, if you get newborn animals of at least two types, you also get a __Sow__ action."],
  cost: {},
})
