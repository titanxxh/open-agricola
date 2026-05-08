import type { CardImpl } from '../registry'
import { C7_BladeShears } from '../../cards-display/C/C7_BladeShears'
export { C7_BladeShears }

const CARD_ID = C7_BladeShears.id

export const C7_BladeShears_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const sheep = player.resources.sheep ?? 0
    return {
      type: 'xor' as const,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'gain',
          sourceCard: CARD_ID,
          params: { food: 3 },
        },
        {
          type: 'leaf' as const,
          actionId: 'gain',
          sourceCard: CARD_ID,
          params: { food: sheep },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
