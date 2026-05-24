import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B149_OpenAirFarmer } from '../../cards-display/B/B149_OpenAirFarmer'

const CARD_ID = B149_OpenAirFarmer.id

export const B149_OpenAirFarmer_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, _player) => ({
      type: 'seq' as const,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { stable: 3 } }),
        {
          type: 'leaf' as const,
          actionId: 'fencing',
          expandFlow: true,
          sourceCard: CARD_ID,
          actionContext: {
            trueAction: false,
            fencePolicy: {
              sourcePolicy: 'ownOnly',
              segmentBounds: { fence: { max: 6 } },
              costPolicy: { fence: { wood: 0 }, fixedWood: 2 },
              cancelPolicy: 'forbidCancel',
              pastureBounds: {
                newPastures: { min: 1, max: 1 },
                changedPastures: { min: 1, max: 1 },
                newPastureSize: { min: 2, max: 2 },
              },
            },
          },
        },
      ],
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
