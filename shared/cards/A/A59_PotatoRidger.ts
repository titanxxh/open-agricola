import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A59_PotatoRidger } from '../../cards-display/A/A59_PotatoRidger'

const CARD_ID = A59_PotatoRidger.id

export const A59_PotatoRidger_impl = {
  effect: {
  id: CARD_ID,
  onAfterReap: (_state, player) => {
    // Only trigger if at least 1 vegetable was harvested
    const vegHarvested = _state.harvestReapSummary?.[player.id]?.vegetableFields ?? 0
    if (vegHarvested <= 0) return
    if (player.resources.vegetable < 3) return
    const mandatory = player.resources.vegetable >= 4
    return {
      type: 'seq',
      optional: !mandatory,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { vegetable: 1 } }),
        gainLeaf(CARD_ID, { food: 6 }),
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
