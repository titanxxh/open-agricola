import { MinorImprovement } from '../types'

const CARD_ID = 'D66_PotterCeramics'

export const D66_PotterCeramics = new MinorImprovement({
  id: CARD_ID,
  name: "Potter Ceramics",
  deck: "D",
  number: 66,
  category: "CROP_PROVIDER",
  desc: ["Each time before you take a __Bake Bread__ action, you can exchange 1 <CLAY> for 1 <GRAIN>."],
  cost: {},
})
