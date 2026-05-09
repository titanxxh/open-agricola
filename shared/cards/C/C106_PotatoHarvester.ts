import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C106_PotatoHarvester } from '../../cards-display/C/C106_PotatoHarvester'

const CARD_ID = C106_PotatoHarvester.id

export const C106_PotatoHarvester_impl = {
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
