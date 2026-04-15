import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { TradeModifier } from '../../game/types'

const CARD_ID = 'A16_RammedClay'

// A16 Rammed Clay: When you play this card, you immediately get 1 clay.
// You can use clay instead of wood to build fences (1 clay : 1 wood substitution).
registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { clay: 1 }),
})

export const A16_RammedClay = new MinorImprovement({
  id: CARD_ID,
  name: 'Rammed Clay',
  deck: 'A',
  number: 16,
  category: 'FARM_PLANNER',
  desc: [
    'When you play this card, you immediately get 1 <CLAY>. You can use <CLAY> instead of <WOOD> to build fences.',
  ],
  cost: {},
  // Trade modifier: 1 clay substitutes for 1 wood when fencing (BGA: onPlayerComputeCostsFencing)
  modifier: {
    type: 'trade',
    cardId: CARD_ID,
    appliesTo: ['fencing'],
    from: { clay: 1 },
    to: { wood: 1 },
  } as TradeModifier,
})
