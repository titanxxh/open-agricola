import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getStoredResource } from '../../helpers/card-storage'
import { gainLeaf, payGainActionFlow } from '../../helpers/pay-gain-node'

const CARD_ID = 'CFL014_JeneverDistillery'

const cardImpl = {
  prerequisiteCheck: (player) => player.resources.wood >= 1,

  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const max = Math.min(4, player.resources.wood)
      if (max === 0) return
      return {
        type: 'xor',
        children: Array.from({ length: max }, (_, index) => {
          const wood = index + 1
          return payGainActionFlow({
            cardId: CARD_ID,
            cost: { wood },
            choiceLabelKey: 'ui.interactionResourceExchange',
            followUp: [
              { type: 'leaf', actionId: 'store-on-card', sourceCard: CARD_ID, params: { wood } },
            ],
          })
        }),
      }
    },
    onHarvestFieldPhase: (_state, player) => {
      const food = getStoredResource(player, CARD_ID, 'wood')
      if (food > 0) return gainLeaf(CARD_ID, { food })
    },
  },
  listeners: [
    {
      id: CARD_ID + '-withdraw',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      handler: ({ player }) =>
        getStoredResource(player, CARD_ID, 'wood') > 0
          ? {
              flow: {
                type: 'leaf',
                actionId: 'take-from-card',
                sourceCard: CARD_ID,
                params: { wood: 1 },
              },
            }
          : undefined,
    },
  ],
} satisfies CardImpl

export const CFL014_JeneverDistillery = defineMinorCard({
  meta: {
    id: 'CFL014_JeneverDistillery',
    name: 'Jenever Distillery',
    deck: 'CFL',
    number: 14,
    cost: {
      clay: 3,
      stone: 1,
    },
    vp: 1,
    desc: [
      'When you play this card, place 1–4 <WOOD> from your supply on it. You may take any of this wood back at any time. In each harvest field phase, you get 1 <FOOD> for each <WOOD> still here.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL014.png',
  },
  presentation: { counters: ['wood'] },
  impl: cardImpl,
})
