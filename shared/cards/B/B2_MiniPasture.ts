import type { CardImpl } from '../registry'
import { B2_MiniPasture } from '../../cards-display/B/B2_MiniPasture'
export { B2_MiniPasture }

const CARD_ID = B2_MiniPasture.id

export const B2_MiniPasture_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'leaf' as const,
    actionId: 'fencing',
    sourceCard: CARD_ID,
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
