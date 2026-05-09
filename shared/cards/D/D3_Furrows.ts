import type { CardImpl } from '../registry'
import { D3_Furrows } from '../../cards-display/D/D3_Furrows'

const CARD_ID = D3_Furrows.id

export const D3_Furrows_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'sow',
    sourceCard: CARD_ID,
    optional: true,
    actionContext: { maxSelections: 1 },
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
