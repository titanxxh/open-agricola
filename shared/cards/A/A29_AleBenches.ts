import { MinorImprovement } from '../types'

export const A29_AleBenches = new MinorImprovement({
  id: "A29_AleBenches",
  name: "Ale-Benches",
  deck: "A",
  number: 29,
  category: "POINTS_PROVIDER",
  desc: ["In the returning home phase of each round, you can pay exactly 1 <GRAIN> from your supply to get 1 bonus <SCORE>. If you do, each other player gets 1 <FOOD>."],
  cost: {"wood":1},
  prerequisite: "2 Occupations",
  occupationPrerequisites: {"min":2},
  newSet: true,
})
