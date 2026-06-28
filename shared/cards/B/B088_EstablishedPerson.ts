import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'B088_EstablishedPerson'

const cardImpl = {
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

export const B088_EstablishedPerson = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Established Person',
    deck: 'B',
    number: 88,
    category: 'FARM_PLANNER',
    desc: ['If your house has exactly 2 rooms, immediately renovate it without paying any building resources. If you do, you can immediately afterward take a __Build Fences__ action.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const B088_EstablishedPerson_impl = B088_EstablishedPerson.impl
