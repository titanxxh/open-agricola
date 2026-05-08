import { MinorImprovement } from '../types'

const CARD_ID = 'C75_Firewood'

export const C75_Firewood = new MinorImprovement({
  id: CARD_ID,
  name: "Firewood",
  deck: "C",
  number: 75,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["In the returning home phase of each round, place 1 <WOOD> on this card. Each time after you build a Fireplace, Cooking Hearth, or oven, move up to 4 <WOOD> from this card to your supply."],
  cost: {"food": 2},
})
