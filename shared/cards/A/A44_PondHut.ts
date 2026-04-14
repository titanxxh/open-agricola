import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'

const CARD_ID = 'A44_PondHut'

// BGA: Place 1 FOOD on each of the next 3 round spaces. At the start of these rounds, you get the FOOD.
registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) =>
    queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: 3,
      resources: { food: 1 },
    }),
})

export const A44_PondHut = new MinorImprovement({
  id: CARD_ID,
  name: 'Pond Hut',
  deck: 'A',
  number: 44,
  category: 'FOOD_PROVIDER',
  desc: ['Place 1 <FOOD> on each of the next 3 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: { wood: 1 },
  vp: 1,
  prerequisite: 'Exactly 2 Occupations',
  occupationPrerequisites: { min: 2, max: 2 },
})
