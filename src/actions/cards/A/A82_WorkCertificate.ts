import { MinorImprovement } from '../types'

export const A82_WorkCertificate = new MinorImprovement({
  id: "A82_WorkCertificate",
  name: "Work Certificate",
  deck: "A",
  number: 82,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: [],
  cost: {"food":1},
  occupationPrerequisites: {"min":3},
  newSet: true,
})
