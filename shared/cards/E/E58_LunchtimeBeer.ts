import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E58_LunchtimeBeer } from '../../cards-display/E/E58_LunchtimeBeer'
export { E58_LunchtimeBeer }

const CARD_ID = E58_LunchtimeBeer.id

export const E58_LunchtimeBeer_impl = {
  effect: {
    id: CARD_ID,
    onStartHarvest: (state, _player) => ({
      type: 'seq',
      optional: true,
      children: [
        gainLeaf(CARD_ID, { food: 1 }),
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: {
            kind: 'set-extra-data',
            key: 'passFieldAndBreedRound',
            value: state.round,
          },
        },
      ],
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
