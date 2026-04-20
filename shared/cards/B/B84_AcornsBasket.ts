import { MinorImprovement } from '../types'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'B84_AcornsBasket'

export const B84_AcornsBasket = new MinorImprovement({
  id: CARD_ID,
  name: 'Acorns Basket',
  deck: 'B',
  number: 84,
  category: 'ANIMAL_HANDLER',
  desc: ['Place 1 <PIG> on each of the next 2 round spaces. At the start of these rounds, you get the <PIG>.'],
  cost: { reed: 1 },
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})

export const B84_AcornsBasket_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: 2,
      resources: { boar: 1 },
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
