import { MinorImprovement } from '../types'

export const B23_FinalScenario = new MinorImprovement({
  id: "B23_FinalScenario",
  name: "Final Scenario",
  deck: "B",
  number: 23,
  category: "ACTIONS_BOOSTER",
  desc: ["Reveal the action space card for round 14. Only you can use it until round 14 starts."],
  cost: {},
  prerequisite: "Round 13 or Before",
})
