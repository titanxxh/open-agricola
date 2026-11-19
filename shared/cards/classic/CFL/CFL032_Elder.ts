import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getStoredResource, payStoredResourceLeaf } from '../../helpers/card-storage'
import { jumpLeaf } from '../../helpers/jump-leaf'

const CARD_ID = 'CFL032_Elder'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'leaf',
      actionId: 'store-on-card',
      sourceCard: CARD_ID,
      params: { food: 2 },
    }),
    onAllWorkersPlaced: (_state, player) => {
      const food = getStoredResource(player, CARD_ID, 'food')
      if (food <= 0) return
      return {
        type: 'seq',
        optional: true,
        children: [
          payStoredResourceLeaf(player, CARD_ID, 'food', 1),
          {
            type: 'xor',
            children: [
              jumpLeaf({ sourceCard: CARD_ID, targetSpaceId: 'fishing' }),
              {
                type: 'leaf',
                actionId: 'bake-bread',
                sourceCard: CARD_ID,
                actionContext: { trueAction: false },
              },
            ],
          },
        ],
      }
    },
  },
  listeners: [
    {
      id: CARD_ID + '-withdraw',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      handler: ({ player }) =>
        getStoredResource(player, CARD_ID, 'food') > 0
          ? {
              flow: {
                type: 'leaf',
                actionId: 'take-from-card',
                sourceCard: CARD_ID,
                params: { food: 1 },
              },
            }
          : undefined,
    },
  ],
} satisfies CardImpl

export const CFL032_Elder = defineOccupationCard({
  meta: {
    id: 'CFL032_Elder',
    name: 'Elder',
    deck: 'CFL',
    number: 32,
    players: '1+',
    extraVp: false,
    desc: [
      'Place 2 <FOOD> on this card; you may take them at any time. At the end of a work phase, you may pay 1 food from this card to use Fishing without placing a person, or to Bake Bread.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL032.png',
  },
  presentation: { counters: ['food'] },
  impl: cardImpl,
})
