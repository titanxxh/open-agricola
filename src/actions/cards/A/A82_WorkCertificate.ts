import { MinorImprovement } from '../types'

export const A82_WorkCertificate = new MinorImprovement({
  id: "A82_WorkCertificate",
  name: "Work Certificate",
  deck: "A",
  number: 82,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time after you use an action space, you can take 1 building resource from a building resource accumulation space with at least 4 building resources on it."],
  cost: {"food":1},
  occupationPrerequisites: {"min":3},
  newSet: true,
})
