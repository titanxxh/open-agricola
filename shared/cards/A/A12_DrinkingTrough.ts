import type { CardImpl } from '../registry'
import { A12_DrinkingTrough } from '../../cards-display/A/A12_DrinkingTrough'

const CARD_ID = A12_DrinkingTrough.id

export const A12_DrinkingTrough_impl = {
  effect: {
    id: CARD_ID,
    computePastureCapacityModifiers: () => [{
      sourceCard: CARD_ID,
      kind: 'additive',
      apply: (capacity) => capacity + 2,
    }],
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
