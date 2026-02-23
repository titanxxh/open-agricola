import { MinorImprovement } from '../types'

export const E62_SourDough = new MinorImprovement({
  id: "E62_SourDough",
  name: "Sour Dough",
  deck: "E",
  number: 62,
  desc: ["Once per round, if all players have at least 1 person left to place, you can skip placing a person and take a __Bake Bread__ action instead."],
  cost: {},
  prerequisite: "3 Occupations and 1 Baking Improvement",
  occupationPrerequisites: {"min":3},
})
