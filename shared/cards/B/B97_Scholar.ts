import type { CardImpl } from '../registry'
import { B97_Scholar } from '../../cards-display/B/B97_Scholar'

const CARD_ID = B97_Scholar.id

export const B97_Scholar_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (player.houseType !== 'stone') return
    return {
      type: 'xor',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'occupation',
          sourceCard: CARD_ID,
          params: { costOverride: { food: 1 } },
        },
        {
          type: 'leaf',
          actionId: 'improvement',
          sourceCard: CARD_ID,
          actionContext: { types: ['minor'], trueAction: false },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
