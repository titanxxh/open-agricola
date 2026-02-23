import { MinorImprovement } from '../types'

export const C84_PerennialRye = new MinorImprovement({
  id: "C84_PerennialRye",
  name: "Perennial Rye",
  deck: "C",
  number: 84,
  category: "LIVESTOCK_PROVIDER",
  desc: ["Each round that does not end with a harvest, you can pay 1 <GRAIN> to breed exactly 1 type of animal. (This is not considered a breeding phase.)"],
  cost: {"food":1},
  prerequisite: "2 Occupations",
  occupationPrerequisites: {"min":2},
  newSet: true,
})
