import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { createPartialTakeFromSpaceLeaf } from '../../helpers/partial-take'

const CARD_ID = 'CFL051_NorthSeaFisherman'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-new-space',
      cardIds: [CARD_ID],
      actionSpaces: 'all',
      phases: ['before'],
      handler: ({ state, space }) => {
        if (space?.id !== state.roundActionOrder[state.round - 1]) return
        const food = state.actionSpaces.find((entry) => entry.id === 'fishing')?.resources.food ?? 0
        if (food > 0)
          return {
            flow: {
              ...createPartialTakeFromSpaceLeaf({
                sourceCard: CARD_ID,
                spaceId: 'fishing',
                resource: 'food',
                amount: food,
              }),
              optional: true,
            },
          }
      },
    },
    {
      id: CARD_ID + '-opponent-fishing',
      cardIds: [CARD_ID],
      actionSpaces: ['fishing'],
      phases: ['before'],
      scope: 'opponent',
      handler: (context) => ({
        flow: {
          type: 'leaf',
          actionId: 'gain',
          sourceCard: CARD_ID,
          params: { food: 1, recipientPlayerId: (context.triggerPlayer ?? context.player).id },
        },
      }),
    },
  ],
} satisfies CardImpl

export const CFL051_NorthSeaFisherman = defineOccupationCard({
  meta: {
    id: 'CFL051_NorthSeaFisherman',
    name: 'North Sea Fisherman',
    deck: 'CFL',
    number: 51,
    players: '1+',
    desc: [
      'Whenever you use the action space revealed this round, you may take all <FOOD> on Fishing. Whenever another player uses Fishing, that player gets 1 additional <FOOD>.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL051.png',
  },
  impl: cardImpl,
})
