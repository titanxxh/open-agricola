import type { CardImpl } from '../registry'
import { B2_MiniPasture } from '../../cards-display/B/B2_MiniPasture'

const CARD_ID = B2_MiniPasture.id

export const B2_MiniPasture_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'leaf' as const,
    actionId: 'fence',
    sourceCard: CARD_ID,
    actionContext: {
      fencePolicy: {
        segmentBounds: { total: { min: 1, max: 4 } },
        newPastureBounds: {
          count: { min: 1, max: 1 },
          totalSize: { min: 1, max: 1 },
        },
        costPolicy: { fence: { wood: 0 } },
      },
    },
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
