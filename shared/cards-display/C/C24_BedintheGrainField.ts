import { MinorImprovement } from '../types'

export const C24_BedintheGrainField = new MinorImprovement({
  id: "C24_BedintheGrainField",
  name: "Bed in the Grain Field",
  deck: "C",
  number: 24,
  category: "ACTIONS_BOOSTER",
  desc: ["At the start of the next harvest, you get a __Family Growth__ action if you have room for the newborn."],
  cost: {},
  prerequisite: "1 Grain Field",
  newSet: true,
})
