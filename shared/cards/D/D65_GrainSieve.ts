import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D65_GrainSieve } from '../../cards-display/D/D65_GrainSieve'
export { D65_GrainSieve }

const CARD_ID = D65_GrainSieve.id

export const D65_GrainSieve_impl = {
  effect: {
  id: CARD_ID,
  onAfterReap: (_state, player) => {
    // Check if at least 2 grain were harvested from fields
    const grainFields = _state.harvestReapSummary?.[player.id]?.grainFields ?? 0
    if (grainFields < 2) return
    return {
      type: 'seq',
      children: [gainLeaf(CARD_ID, { grain: 1 })],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
