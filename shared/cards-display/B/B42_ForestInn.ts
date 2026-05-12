import { PlayerActionCard } from '../types'

const CARD_ID = 'B42_ForestInn'

export const B42_ForestInn = new PlayerActionCard({
  id: CARD_ID,
  name: "Forest Inn",
  deck: "B",
  number: 42,
  category: "GOODS_PROVIDER",
  desc: ["This is an action space for all. A player who uses it can exchange 5/7/9 <WOOD> for 8 <WOOD> and 2/4/7 <FOOD>. When another player uses it, they must first pay you 1 <FOOD>."],
  cost: {"clay":1,"reed":1},
  vp: 1,
  prerequisite: "Play in Round 6 or Before",
  maxRound: 6,
})
