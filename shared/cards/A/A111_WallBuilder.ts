import { defineOccupationCard } from '../card-source'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'

const CARD_ID = 'A111_WallBuilder'

export const A111_WallBuilder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Wall Builder',
    deck: 'A',
    number: 111,
    category: 'FOOD_PROVIDER',
    desc: [
        'Each time you build at least 1 room, you can place 1 <FOOD> on each of the next 4 round spaces. At the start of these rounds, you get the <FOOD>.',
      ],
    cost: {},
    players: '1+',
  },
  impl: {
    listeners: [{
      id: 'A111-wall-builder-after-construct',
      cardIds: [CARD_ID],
      phases: ['after'],
      actions: ['construct'],
      handler: (context) => ({
        flow: futureMeeplesNode({
          cardId: CARD_ID,
          playerId: context.player.id,
          startRound: context.state.round + 1,
          count: 4,
          resources: { food: 1 },
        }),
        sourceCard: CARD_ID,
      }),
    }],
    reaches: [],
  },
})

export const A111_WallBuilder_impl = A111_WallBuilder.impl
