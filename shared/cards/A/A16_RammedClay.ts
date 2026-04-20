import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { TradeModifier } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A16_RammedClay'

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

export const A16_RammedClay_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { clay: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
