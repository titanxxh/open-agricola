import { MinorImprovement } from '../types'

export const B55_MaintenancePremium = new MinorImprovement({
  id: "B55_MaintenancePremium",
  name: "Maintenance Premium",
  deck: "B",
  number: 55,
  category: "FOOD_PROVIDER",
  desc: [],
  cost: {},
  prerequisite: "2 Occupations",
  occupationPrerequisites: {"min":2},
  newSet: true,
})
