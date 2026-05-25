import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B1_UpscaleLifestyle } from '../../cards-display/B/B1_UpscaleLifestyle'

const CARD_ID = B1_UpscaleLifestyle.id

export const B1_UpscaleLifestyle_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, _player) => ({
      type: 'seq' as const,
      children: [
        gainLeaf(CARD_ID, { clay: 5 }),
        {
          type: 'seq' as const,
          optional: true,
          children: [
            {
              type: 'leaf' as const,
              actionId: 'renovate-house',
              sourceCard: CARD_ID,
            },
          ],
        },
      ],
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
