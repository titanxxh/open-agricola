import { defineMinorCard } from '../card-source'
import type { TradeModifier } from '../../contract/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A016_RammedClay'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { clay: 1 }),
},
  modifiers: [{
    type: 'trade',
    cardId: CARD_ID,
    appliesTo: ['fencing'],
    from: { clay: 1 },
    to: { wood: 1 },
    scope: 'unit',
  } as TradeModifier],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A016_RammedClay = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Rammed Clay',
    deck: 'A',
    number: 16,
    category: 'FARM_PLANNER',
    desc: [
        'When you play this card, you immediately get 1 <CLAY>. You can use <CLAY> instead of <WOOD> to build fences.',
      ],
    cost: {},
  },
  impl: cardImpl,
})

export const A016_RammedClay_impl = A016_RammedClay.impl
