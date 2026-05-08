import type { CardImpl } from '../registry'
import { E63_IronOven } from '../../cards-display/E/E63_IronOven'
export { E63_IronOven }

const CARD_ID = E63_IronOven.id

export const E63_IronOven_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'bake-bread',
    sourceCard: CARD_ID,
    optional: true,
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
