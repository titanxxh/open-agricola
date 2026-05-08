import type { CardImpl } from '../registry'
import { E145_Parvenu } from '../../cards-display/E/E145_Parvenu'
export { E145_Parvenu }

const CARD_ID = E145_Parvenu.id

export const E145_Parvenu_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    if (state.round > 7) return

    const clays = player.resources.clay ?? 0
    const reeds = player.resources.reed ?? 0

    if (clays <= 0 && reeds <= 0) return

    if (clays > 0 && reeds <= 0) {
      return {
        type: 'leaf' as const,
        actionId: 'gain',
        sourceCard: CARD_ID,
        params: { clay: clays },
      }
    }

    if (clays <= 0 && reeds > 0) {
      return {
        type: 'leaf' as const,
        actionId: 'gain',
        sourceCard: CARD_ID,
        params: { reed: reeds },
      }
    }

    // Both available — player chooses
    return {
      type: 'xor' as const,
      optional: true,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'gain',
          sourceCard: CARD_ID,
          params: { clay: clays },
        },
        {
          type: 'leaf' as const,
          actionId: 'gain',
          sourceCard: CARD_ID,
          params: { reed: reeds },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
