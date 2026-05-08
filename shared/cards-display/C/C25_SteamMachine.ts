import { MinorImprovement } from '../types'

export const C25_SteamMachine = new MinorImprovement({
  id: "C25_SteamMachine",
  name: "Steam Machine",
  deck: "C",
  number: 25,
  category: "ACTIONS_BOOSTER",
  desc: ["Each work phase, if the last action space you use is an accumulation space, you can immediately afterward take a __Bake Bread__ action."],
  vp: 1,
  cost: {"wood":2},
})
