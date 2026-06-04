import { defineMajorCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'

export const Major_Well = defineMajorCard({
  meta: {
  id: 'Major_Well',
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
      id: 'Major_Well',
      onBuy: (state, player) =>
        queueFutureMeeplesFlow(state, {
          cardId: 'Major_Well',
          playerId: player.id,
          startRound: state.round + 1,
          count: 5,
          resources: { food: 1 },
        }),
    },
    reaches: [] as readonly string[],
  },
})
