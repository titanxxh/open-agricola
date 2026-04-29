import { Occupation } from '../types'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B93_Confidant'

export const B93_Confidant = new Occupation({
  id: CARD_ID,
  name: 'Confidant',
  deck: 'B',
  number: 93,
  category: 'ACTIONS_BOOSTER',
  desc: ['Place 1 <FOOD> from your supply on each of the next 2, 3, or 4 round spaces. At the start of these rounds, you get the <FOOD> back and your choice of a __Sow__ or __Build Fences__ action.'],
  cost: {},
  players: '1+',
})

export const B93_Confidant_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const max = Math.min(14 - state.round, 4)
    const count = Math.max(2, max)
    return {
      type: 'seq' as const,
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: count } }),
        queueFutureMeeplesFlow(state, {
          cardId: CARD_ID,
          playerId: player.id,
          startRound: state.round + 1,
          count,
          resources: { food: 1 },
        }),
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
