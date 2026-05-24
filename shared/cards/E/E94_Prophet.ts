import type { CardImpl } from '../registry'
import { E94_Prophet } from '../../cards-display/E/E94_Prophet'

const CARD_ID = E94_Prophet.id

export const E94_Prophet_impl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'seq' as const,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'renovate-house',
          sourceCard: CARD_ID,
        },
        {
          type: 'leaf' as const,
          actionId: 'fence',
          sourceCard: CARD_ID,
          optional: true,
        },
      ],
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
