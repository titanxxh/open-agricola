import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { defineMajorCard } from '../card-source'

const CARD_ID = 'Major_Well'

export const Major_Well = defineMajorCard({
  meta: {
    id: CARD_ID,
    name: 'Well',
    deck: 'major',
    number: 7,
    cost: { wood: 1, stone: 3 },
    vp: 4,
    extraVp: false,
    desc: ['[Put 1 <FOOD> on the 5 next turns. At the start of each turn, collect the <FOOD>]'],
  },
  impl: {
    effect: {
      id: CARD_ID,
      onBuy: (state, player) =>
        queueFutureMeeplesFlow(state, {
          cardId: CARD_ID,
          playerId: player.id,
          startRound: state.round + 1,
          count: 5,
          resources: { food: 1 },
        }),
    },
    reaches: [] as readonly string[],
  },
})
