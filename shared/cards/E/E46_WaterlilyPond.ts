import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'E46_WaterlilyPond'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const count = Math.min(2, 14 - state.round)
    if (count <= 0) return

    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count,
      resources: { food: 1 },
    })
    return futureMeeplesNode()
  },
})

export const E46_WaterlilyPond = new MinorImprovement({
  id: CARD_ID,
  name: 'Waterlily Pond',
  deck: 'E',
  number: 46,
  category: 'FOOD_MISC',
  desc: ['Place 1 <FOOD> on each of the next 2 round spaces. At the start of these rounds, you get the <FOOD>.'],
  vp: 1,
  prerequisite: 'Exactly 2 Occupations',
  occupationPrerequisites: { min: 2, max: 2 },
})
