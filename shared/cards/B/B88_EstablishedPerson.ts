import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B88_EstablishedPerson } from '../../cards-display/B/B88_EstablishedPerson'

const CARD_ID = B88_EstablishedPerson.id

export const B88_EstablishedPerson_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    if (player.rooms !== 2 || player.houseType === 'stone') return
    return {
      type: 'seq' as const,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'renovation',
          sourceCard: CARD_ID,
        },
        {
          type: 'seq' as const,
          optional: true,
          children: [
            payLeaf({ cardId: CARD_ID, cost: { wood: 1 } }),
            {
              type: 'leaf' as const,
              actionId: 'fencing',
              sourceCard: CARD_ID,
            },
          ],
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
