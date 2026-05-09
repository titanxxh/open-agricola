import type { CardImpl } from '../registry'
import { D133_BeerTentOperator } from '../../cards-display/D/D133_BeerTentOperator'

const CARD_ID = D133_BeerTentOperator.id

export const D133_BeerTentOperator_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, player) => {
    if (player.resources.wood < 1 || player.resources.grain < 1) return

    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'pay', params: { wood: 1, grain: 1 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
