import { MinorImprovement } from '../types'
import type { BonusModifier } from '../../contract/types'

const CARD_ID = 'B15_CarpentersBench'

export const B15_CarpentersBench = new MinorImprovement({
  id: CARD_ID,
  name: "Carpenter's Bench",
  deck: 'B',
  number: 15,
  category: 'FARM_PLANNER',
  desc: ["Immediately after each time you use a wood accumulation space, you can use the taken wood (and only that) to build exactly 1 pasture. If you do, one of the fences is free."],
  cost: { wood: 1 },
  evenMoreSet: true,
  modifier: {
    type: 'bonus',
    cardId: 'B15_CarpentersBench',
    appliesTo: ['fencing'],
    discount: { wood: 1 },
  } as BonusModifier,
})
