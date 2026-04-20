import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B58_CrackWeeder'

export const B58_CrackWeeder = new MinorImprovement({
  id: CARD_ID,
  name: 'Crack Weeder',
  deck: 'B',
  number: 58,
  category: 'FOOD_PROVIDER',
  desc: [
    'When you play this card, you immediately get 1 <FOOD>. For each <VEGETABLE> you take from a field in the field phase of a harvest, you also get 1 <FOOD>.',
  ],
  cost: { wood: 1 },
  newSet: true,
})

export const B58_CrackWeeder_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { food: 1 }),
  onAfterReap: (state, player) => {
    const vegFields = state.harvestReapSummary?.[player.id]?.vegetableFields ?? 0
    if (vegFields <= 0) return
    return gainLeaf(CARD_ID, { food: vegFields })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
