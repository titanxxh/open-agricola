import { MinorImprovement } from '../types'

const CARD_ID = 'C8_PlantFertilizer'

export const C8_PlantFertilizer = new MinorImprovement({
  id: CARD_ID,
  name: "Plant Fertilizer",
  deck: "C",
  number: 8,
  category: "CROP_PROVIDER",
  desc: ["In each field with exactly 1 good, you can immediately place 1 additional good of the same type."],
  cost: {},
  passing: true,
  newSet: true,
})
