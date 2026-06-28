import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B058_CrackWeeder'

const cardImpl = {
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

export const B058_CrackWeeder = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Crack Weeder',
    deck: 'B',
    number: 58,
    category: 'FOOD_PROVIDER',
    desc: [
        'When you play this card, you immediately get 1 <FOOD>. For each <VEGETABLE> you take from a field in the field phase of a harvest, you also get 1 <FOOD>.',
      ],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const B058_CrackWeeder_impl = B058_CrackWeeder.impl
