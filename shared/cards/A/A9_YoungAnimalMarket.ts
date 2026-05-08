import type { CardImpl } from '../registry'
import { A9_YoungAnimalMarket } from '../../cards-display/A/A9_YoungAnimalMarket'
export { A9_YoungAnimalMarket }

const CARD_ID = A9_YoungAnimalMarket.id

export const A9_YoungAnimalMarket_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'gain',
    sourceCard: CARD_ID,
    params: { cattle: 1 },
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
