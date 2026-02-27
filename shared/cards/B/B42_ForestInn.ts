import { PlayerActionCard } from '../types'

export const B42_ForestInn = new PlayerActionCard({
  id: "B42_ForestInn",
  name: "Forest Inn",
  deck: "B",
  number: 42,
  category: "GOODS_PROVIDER",
  desc: ["This is an action space for all. A player who uses it can exchange 5/7/9 <WOOD> for 8 <WOOD> and 2/4/7 <FOOD>. When another player uses it, they must first pay you 1 <FOOD>."],
  cost: {"clay":1,"reed":1},
  prerequisite: "Play in Round 6 or Before",
  newSet: true,
})
