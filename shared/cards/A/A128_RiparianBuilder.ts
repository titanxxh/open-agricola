import { MinorImprovement } from '../types'
import type { BonusModifier } from '../../game/types'

export const A128_RiparianBuilder = new MinorImprovement({
  id: "A128_RiparianBuilder",
  name: "Riparian Builder",
  deck: "A",
  number: 128,
  category: "FARM_PLANNER",
  desc: ["Each time another player uses the __Reed Bank__ accumulation space, you can build a room: if you build a clay/stone room, you get a discount of 1 <CLAY>/2 <STONE>."],
  cost: {},
  players: "3+",
  newSet: true,
  modifier: {
    type: 'bonus',
    cardId: 'A128_RiparianBuilder',
    appliesTo: ['construct'],
    discount: { food: 1 },
  } as BonusModifier,
})
