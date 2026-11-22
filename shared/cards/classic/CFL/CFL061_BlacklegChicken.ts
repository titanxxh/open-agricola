import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getStoredResource } from '../../helpers/card-storage'

const CARD_ID = 'CFL061_BlacklegChicken'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'leaf',
      actionId: 'store-on-card',
      sourceCard: CARD_ID,
      params: { food: 2 },
    }),
    onStartHarvest: (_state, player) => {
      if (getStoredResource(player, CARD_ID, 'food') >= 2)
        return { type: 'leaf', actionId: 'store-on-card', sourceCard: CARD_ID, params: { food: 1 } }
    },
    computeBonusScore: (_state, player) =>
      getStoredResource(player, CARD_ID, 'food') >= 4 ? 2 : 0,
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

export const CFL061_BlacklegChicken = defineMinorCard({
  meta: {
    id: 'CFL061_BlacklegChicken',
    name: 'Blackleg Chicken',
    deck: 'CFL',
    number: 61,
    cost: {
      food: 2,
    },
    extraVp: true,
    desc: [
      'Place the 2 <FOOD> paid for this card on it. At the start of each harvest, if at least 2 <FOOD> remain here, add 1 <FOOD>. You may take this <FOOD> at any time. During scoring, you get 2 bonus <SCORE> if at least 4 <FOOD> remain.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL061.png',
  },
  presentation: { counters: ['food'] },
  impl: cardImpl,
})
