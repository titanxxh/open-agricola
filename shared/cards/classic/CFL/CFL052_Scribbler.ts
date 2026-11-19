import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getStoredResource } from '../../helpers/card-storage'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CFL052_Scribbler'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onAllWorkersPlaced: (state) =>
      !state.actionSpaces.find((space) => space.id === 'day-laborer')?.takenBy.length
        ? { type: 'leaf', actionId: 'store-on-card', sourceCard: CARD_ID, params: { food: 1 } }
        : undefined,
    computeBonusScore: (_state, player) =>
      [4, 6, 8, 10].filter((amount) => getStoredResource(player, CARD_ID, 'food') >= amount).length,
  },
  listeners: [
    {
      id: CARD_ID + '-day-laborer',
      cardIds: [CARD_ID],
      actionSpaces: ['day-laborer'],
      phases: ['after'],
      scope: 'opponent',
      handler: (context) => ({
        flow: {
          type: 'seq',
          children: [
            gainLeaf(CARD_ID, { food: 1 }),
            {
              type: 'leaf',
              actionId: 'gain',
              sourceCard: CARD_ID,
              params: { food: 1, recipientPlayerId: (context.triggerPlayer ?? context.player).id },
            },
          ],
        },
      }),
    },
    {
      id: CARD_ID + '-occupation-food',
      cardIds: [CARD_ID],
      actions: ['occupation'],
      phases: ['computeCosts'],
      handler: ({ player }) => ({
        paymentResourceProviders: [
          {
            key: `${CARD_ID}:food`,
            sourceCard: CARD_ID,
            available: getStoredResource(player, CARD_ID, 'food'),
            covers: [{ resource: 'food', costAmount: 1, paymentAmount: 1 }],
            consume: { type: 'card', playerId: player.id, cardId: CARD_ID, resource: 'food' },
          },
        ],
      }),
    },
  ],
} satisfies CardImpl

export const CFL052_Scribbler = defineOccupationCard({
  meta: {
    id: 'CFL052_Scribbler',
    name: 'Scribbler',
    deck: 'CFL',
    number: 52,
    players: '3+',
    extraVp: true,
    desc: [
      'Whenever another player uses Day Laborer, you both get 1 <FOOD>. At the end of a work phase in which nobody used it, put 1 <FOOD> on this card. You may use this food to pay occupation costs. During scoring, 4/6/8/10 food here is worth 1/2/3/4 bonus points.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL052.png',
  },
  presentation: { counters: ['food'] },
  impl: cardImpl,
})
