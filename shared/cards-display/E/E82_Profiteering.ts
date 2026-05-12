import { MinorImprovement } from '../types'

export const E82_Profiteering = new MinorImprovement({
  id: "E82_Profiteering",
  name: "Profiteering",
  deck: "E",
  number: 82,
  desc: ["When you play this card, you immediately get 1 <FOOD>. Each time you use the __Day Laborer__ action space, you can exchange 1 building resource for another building resource."],
  cost: {},
  category: 'BUILDING_RESOURCES_-_ALL',
})
