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
            actionId: 'renovate-house',
            sourceCard: CARD_ID,
            actionContext: { exactCost: {} },
          },
          {
            type: 'leaf' as const,
            actionId: 'fence',
            sourceCard: CARD_ID,
            optional: true,
          },
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
