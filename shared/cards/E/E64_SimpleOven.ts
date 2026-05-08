import type { CardImpl } from '../registry'
import { E64_SimpleOven } from '../../cards-display/E/E64_SimpleOven'

const CARD_ID = E64_SimpleOven.id

export const E64_SimpleOven_impl = {
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
