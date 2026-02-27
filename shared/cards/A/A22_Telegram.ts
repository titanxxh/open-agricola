import { MinorImprovement } from '../types'

export const A22_Telegram = new MinorImprovement({
  id: "A22_Telegram",
  name: "Telegram",
  deck: "A",
  number: 22,
  category: "ACTIONS_BOOSTER",
  desc: ["Add 1 to the current round for each fence in your supply and mark the corresponding round space. In that round only, you can place a person from your supply."],
  cost: {"food":2},
  prerequisite: "At Least 1 Fence in Supply",
})
