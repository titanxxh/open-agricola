import { MinorImprovement } from '../types'

export const D72_StableManure = new MinorImprovement({
  id: "D72_StableManure",
  name: "Stable Manure",
  deck: "D",
  number: 72,
  category: "CROP_PROVIDER",
  desc: [],
  cost: {},
  prerequisite: "At Most 1 Occupation",
  occupationPrerequisites: {"max":1},
})
