import { MinorImprovement } from '../types'

export const E33_BeaverColony = new MinorImprovement({
  id: "E33_BeaverColony",
  name: "Beaver Colony",
  deck: "E",
  number: 33,
  desc: ["From now on, one of your pastures with stable cannot hold animals. Each time you get <REED> from an action space, you get 1 bonus <SCORE>."],
  cost: {},
  prerequisite: "1 Fenced Stable",
})
