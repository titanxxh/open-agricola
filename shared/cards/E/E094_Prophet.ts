import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E094_Prophet'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'seq' as const,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'renovate-house',
          sourceCard: CARD_ID,
        },
        {
          type: 'leaf' as const,
          actionId: 'fence',
          sourceCard: CARD_ID,
          optional: true,
        },
      ],
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E094_Prophet = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Prophet',
    deck: 'E',
    number: 94,
    category: 'ACTION',
    desc: ['When you play this card, immediately take a __Renovation__ action. Afterward, you can take a __Build Fences__ action. (Both actions require their usual cost.)'],
    players: '1+',
  },
  impl: cardImpl,
})

export const E094_Prophet_impl = E094_Prophet.impl
