import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B149_OpenAirFarmer } from '../../cards-display/B/B149_OpenAirFarmer'
export { B149_OpenAirFarmer }

const CARD_ID = B149_OpenAirFarmer.id

export const B149_OpenAirFarmer_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'seq' as const,
    children: [
      payLeaf({ cardId: CARD_ID, cost: { wood: 2 } }),
      {
        type: 'leaf' as const,
        actionId: 'fencing',
        sourceCard: CARD_ID,
      },
    ],
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
