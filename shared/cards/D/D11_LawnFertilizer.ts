import type { CardImpl } from '../registry'
import { D11_LawnFertilizer } from '../../cards-display/D/D11_LawnFertilizer'

const CARD_ID = D11_LawnFertilizer.id

export const D11_LawnFertilizer_impl = {
  effect: {
    id: CARD_ID,
    computePastureCapacityModifiers: () => [{
      sourceCard: CARD_ID,
      kind: 'replacement',
      appliesTo: ({ pasture }) => pasture.size === 1,
      apply: (_capacity, { pasture }) => 3 * (pasture.stables + 1),
    }],
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
