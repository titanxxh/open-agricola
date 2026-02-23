import { MinorImprovement } from '../types'

export const C23_JobContract = new MinorImprovement({
  id: "C23_JobContract",
  name: "Job Contract",
  deck: "C",
  number: 23,
  category: "ACTIONS_BOOSTER",
  desc: ["If both are unoccupied, you can use the __Day Laborer__ and the adjacent __Lessons__ action space with a single person (in that order). Afterward, both spaces are considered occupied."],
  cost: {},
  prerequisite: "No Occupations",
  occupationPrerequisites: {"max":0},
})
