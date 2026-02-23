import { PlayerActionCard } from '../types'

export const A162_ForestTallyman = new PlayerActionCard({
  id: "A162_ForestTallyman",
  name: "Forest Tallyman",
  deck: "A",
  number: 162,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time both the __Forest__ and __Clay Pit__ accumulation spaces are occupied, you can use this card as an action space to get 2 <CLAY> and 3 <WOOD>."],
  cost: {},
  players: "4+",
})
