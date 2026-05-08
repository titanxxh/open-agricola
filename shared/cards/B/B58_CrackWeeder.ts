import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B58_CrackWeeder } from '../../cards-display/B/B58_CrackWeeder'
export { B58_CrackWeeder }

const CARD_ID = B58_CrackWeeder.id

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
