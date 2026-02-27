import { MinorImprovement } from '../types'

export const D27_Retraining = new MinorImprovement({
  id: "D27_Retraining",
  name: "Retraining",
  deck: "D",
  number: 27,
  category: "ACTIONS_BOOSTER",
  desc: ["At the end of each turn in which you renovate, you can exchange your __Joinery__ for the __Pottery__ or your __Pottery__ for the __Basketmaker's Workshop__."],
  cost: {"food":1},
  prerequisite: "1 Occupation",
  occupationPrerequisites: {"min":1},
})
