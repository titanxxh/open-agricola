import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E152_BargainHunter } from '../../cards-display/E/E152_BargainHunter'
export { E152_BargainHunter }

const CARD_ID = E152_BargainHunter.id

export const E152_BargainHunter_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if ((player.resources.food ?? 0) < 1) return
    if (player.minorHand.length === 0) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
        {
          type: 'leaf',
          actionId: 'minor-improvement',
          sourceCard: CARD_ID,
          actionContext: { trueAction: false },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
