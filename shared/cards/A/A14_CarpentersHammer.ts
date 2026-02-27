import { MinorImprovement } from '../types'
import type { BonusModifier } from '../../game/types'

export const A14_CarpentersHammer = new MinorImprovement({
  id: "A14_CarpentersHammer",
  name: "Carpenter's Hammer",
  deck: "A",
  number: 14,
  category: "FARM_PLANNER",
  desc: ["Each time you build at least 2 wood/clay/stone rooms at once, you get a total discount of 2 <REED> as well as 2 <WOOD>/3 <CLAY>/4 <STONE>."],
  cost: {"wood":1},
  modifier: {
    type: 'bonus',
    cardId: 'A14_CarpentersHammer',
    appliesTo: ['construct'],
    discount: { wood: 1 },
  } as BonusModifier,
})
