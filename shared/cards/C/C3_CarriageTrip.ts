import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'
import { C3_CarriageTrip } from '../../cards-display/C/C3_CarriageTrip'
export { C3_CarriageTrip }

const CARD_ID = C3_CarriageTrip.id

export const C3_CarriageTrip_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    if (workersAvailable(state, player) <= 0) return
    return {
      type: 'seq' as const,
      optional: true,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'place-farmer',
          sourceCard: CARD_ID,
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
