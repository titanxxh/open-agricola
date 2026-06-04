import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D65_GrainSieve'

const cardImpl = {
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

export const D65_GrainSieve = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Grain Sieve',
    deck: 'D',
    number: 65,
    category: 'CROP_PROVIDER',
    desc: [
        'In the field phase of each harvest, if you harvest at least 2 <GRAIN>, you get 1 additional <GRAIN> from the general supply.',
      ],
    cost: { wood: 1 },
    implemented: true,
  },
  impl: cardImpl,
})

export const D65_GrainSieve_impl = D65_GrainSieve.impl
