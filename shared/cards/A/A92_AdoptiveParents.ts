import { Occupation } from '../types'

export const A92_AdoptiveParents = new Occupation({
  id: "A92_AdoptiveParents",
  name: "Adoptive Parents",
  deck: "A",
  number: 92,
  category: "ACTIONS_BOOSTER",
  desc: ["For 1 <FOOD>, you can take an action with offspring in the same round you get it. If you do, the offspring does not count as \"newborn\"."],
  cost: {},
  players: "1+",
})
