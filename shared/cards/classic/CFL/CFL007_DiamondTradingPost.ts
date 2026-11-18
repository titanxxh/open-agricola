import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getStoredResource } from '../../helpers/card-storage'
import { payGainFlow } from '../../helpers/pay-gain-node'

const CARD_ID = 'CFL007_DiamondTradingPost'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'leaf',
      actionId: 'store-on-card',
      sourceCard: CARD_ID,
      params: { stone: 3 },
    }),
    onStartHarvest: (_state, player) => {
      const used = player.cardStates?.[CARD_ID]?.counters?.trades ?? 0
      const animal = (['sheep', 'boar', 'cattle'] as const)[used]
      if (!animal || player.resources.stone <= getStoredResource(player, CARD_ID, 'stone')) return
      return payGainFlow({
        cardId: CARD_ID,
        cost: { stone: 1 },
        gain: { [animal]: 2 },
        followUp: [
          { type: 'leaf', actionId: 'store-on-card', sourceCard: CARD_ID, params: { stone: 1 } },
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-counter', key: 'trades', value: used + 1 },
          },
        ],
      })
    },
  },
  listeners: [
    {
      id: CARD_ID + '-withdraw',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      handler: ({ player }) => {
        const stone = getStoredResource(player, CARD_ID, 'stone')
        if (stone > 0)
          return {
            flow: {
              type: 'leaf',
              actionId: 'take-from-card',
              sourceCard: CARD_ID,
              params: { stone },
            },
          }
      },
    },
  ],
} satisfies CardImpl

export const CFL007_DiamondTradingPost = defineMinorCard({
  meta: {
    id: 'CFL007_DiamondTradingPost',
    name: 'Diamond Trading Post',
    deck: 'CFL',
    number: 7,
    cost: {
      wood: 3,
      clay: 3,
    },
    vp: 1,
    occupationPrerequisites: {
      min: 3,
    },
    desc: [
      'Place 3 <STONE> from the general supply on this card. You may take them at any time. At the start of a harvest, if you have more <STONE> in your supply than on this card, you may place 1 of them here to get 2 <SHEEP>, then 2 <PIG>, then 2 <CATTLE> on successive uses.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL007.png',
  },
  presentation: { counters: ['stone', 'trades'] },
  impl: cardImpl,
})
