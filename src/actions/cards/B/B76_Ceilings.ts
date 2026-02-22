import { MinorImprovement } from '../types'

export const B76_Ceilings = new MinorImprovement({
  id: "B76_Ceilings",
  name: "Ceilings",
  deck: "B",
  number: 76,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: [],
  cost: {"clay":1},
  prerequisite: "1 Occupation",
  occupationPrerequisites: {"min":1},
})
