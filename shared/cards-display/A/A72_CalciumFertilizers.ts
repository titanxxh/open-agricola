import { MinorImprovement } from '../types'

const CARD_ID = 'A72_CalciumFertilizers'

export const A72_CalciumFertilizers = new MinorImprovement({
  id: CARD_ID,
  name: "Calcium Fertilizers",
  deck: "A",
  number: 72,
  category: "CROP_PROVIDER",
  desc: ["Each time you use a __Quarry__ accumulation space, add 1 additional good of the respective type to each of your planted fields growing a single type of crop."],
  cost: {},
  prerequisite: "No Field Tiles",
  newSet: true,
})
