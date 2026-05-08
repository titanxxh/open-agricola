import type { CardImpl } from '../registry'
import { D107_Bellfounder } from '../../cards-display/D/D107_Bellfounder'
export { D107_Bellfounder }

const CARD_ID = D107_Bellfounder.id

export const D107_Bellfounder_impl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (_state, player) => {
    const allClay = player.resources.clay ?? 0
    if (allClay < 1) return
    return {
      type: 'xor',
      optional: true,
      promptKey: 'ui.interactionBellfounder',
      children: [
        {
          type: 'seq',
          children: [
            { type: 'leaf', actionId: 'pay', params: { clay: allClay }, sourceCard: CARD_ID },
            { type: 'leaf', actionId: 'gain', params: { food: 3 }, sourceCard: CARD_ID },
          ],
        },
        {
          type: 'seq',
          children: [
            { type: 'leaf', actionId: 'pay', params: { clay: allClay }, sourceCard: CARD_ID },
            { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID },
          ],
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
