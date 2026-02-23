import { MinorImprovement } from '../types'

export const D72_StableManure = new MinorImprovement({
  id: "D72_StableManure",
  name: "Stable Manure",
  deck: "D",
  number: 72,
  category: "CROP_PROVIDER",
  desc: ["In the field phase of each harvest, you can harvest 1 additional good from a number of fields equal to the number of unfenced stables you have."],
  cost: {},
  prerequisite: "At Most 1 Occupation",
  occupationPrerequisites: {"max":1},
})
