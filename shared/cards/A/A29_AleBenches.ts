import { payGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A29_AleBenches } from '../../cards-display/A/A29_AleBenches'

const CARD_ID = A29_AleBenches.id

export const A29_AleBenches_impl = {
  effect: {
  id: CARD_ID,
  onReturnHome: (_state, player) => {
    if (player.resources.grain < 1) return
    return payGainFlow({
      cardId: CARD_ID,
      cost: { grain: 1 },
      gain: { score: 1 },
      promptKey: 'ui.interactionAleBenches',
      followUp: [
        { type: 'leaf', actionId: 'gain', params: { recipientMode: 'others', food: 1 }, sourceCard: CARD_ID },
      ],
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
