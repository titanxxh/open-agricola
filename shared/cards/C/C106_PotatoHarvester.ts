import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C106_PotatoHarvester'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { food: 3 }),
  onAfterReap: (_state, player) => {
    // Count vegetable fields that were harvested
    const vegFields = _state.harvestReapSummary?.[player.id]?.vegetableFields ?? 0
    if (vegFields <= 0) return
    return {
      type: 'seq',
      children: [gainLeaf(CARD_ID, { food: vegFields })],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C106_PotatoHarvester = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Potato Harvester',
    deck: 'C',
    number: 106,
    category: 'FOOD_PROVIDER',
    desc: [
        'When you play this card, you immediately get 3 <FOOD>. For each <VEGETABLE> you get from your <FIELD> during the field phase of the harvest, you get 1 additional <FOOD>.',
      ],
    cost: {},
    players: '1+',
    implemented: true,
  },
  impl: cardImpl,
})

export const C106_PotatoHarvester_impl = C106_PotatoHarvester.impl
