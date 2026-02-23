import { PlayerActionCard } from '../types'

export const D116_TreeInspector = new PlayerActionCard({
  id: "D116_TreeInspector",
  name: "Tree Inspector",
  deck: "D",
  number: 116,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["This card is a __1 <WOOD>__ accumulation space for you only. Each time the newly revealed action space card is a __Quarry__ accumulation space, you must discard all <WOOD> from this card."],
  cost: {},
  players: "1+",
  newSet: true,
})
