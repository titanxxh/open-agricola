import { Occupation } from '../types'

export const A97_Freshman = new Occupation({
  id: "A97_Freshman",
  name: "Freshman",
  deck: "A",
  number: 97,
  category: "ACTIONS_BOOSTER",
  desc: ["Each time you get a __Bake Bread__ action, instead of taking the action, you can play an occupation without paying an occupation cost (at most once per turn)."],
  cost: {},
  players: "1+",
})
