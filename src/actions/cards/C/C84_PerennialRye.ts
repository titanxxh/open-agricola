import { MinorImprovement } from '../types'

export const C84_PerennialRye = new MinorImprovement({
  id: "C84_PerennialRye",
  name: "Perennial Rye",
  deck: "C",
  number: 84,
  category: "LIVESTOCK_PROVIDER",
  desc: [],
  cost: {"food":1},
  prerequisite: "2 Occupations",
  occupationPrerequisites: {"min":2},
  newSet: true,
})
