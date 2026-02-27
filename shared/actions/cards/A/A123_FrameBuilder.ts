import { Occupation } from '../types'
import type { TradeModifier } from '../../game/types'

export const A123_FrameBuilder = new Occupation({
  id: "A123_FrameBuilder",
  name: "Frame Builder",
  deck: "A",
  number: 123,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time you build a room/renovate, but only once per room/action, you can replace exactly 2 <CLAY> or 2 <STONE> with 1 <WOOD>."],
  cost: {},
  players: "1+",
  modifier: {
    type: 'trade',
    cardId: 'A123_FrameBuilder',
    appliesTo: ['construct', 'renovation'],
    from: { clay: 2 },
    to: { wood: 1 },
    max: 1,
  } as TradeModifier,
})
