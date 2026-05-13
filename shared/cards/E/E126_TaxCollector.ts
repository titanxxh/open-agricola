import type { CardImpl } from '../registry'
import { E126_TaxCollector } from '../../cards-display/E/E126_TaxCollector'

const CARD_ID = E126_TaxCollector.id

export const E126_TaxCollector_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (player.houseType !== 'stone') return
    return {
      type: 'xor',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'gain', params: { wood: 2 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'gain', params: { clay: 2 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'gain', params: { reed: 1 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'gain', params: { stone: 1 }, sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
