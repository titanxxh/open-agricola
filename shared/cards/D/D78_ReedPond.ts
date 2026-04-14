import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'

const CARD_ID = 'D78_ReedPond'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    // Place 1 reed on each of the next 3 round spaces
    const count = Math.min(3, 14 - state.round)
    if (count <= 0) return
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count,
      resources: { reed: 1 },
    })
  },
})

export const D78_ReedPond = new MinorImprovement({
  id: CARD_ID,
  name: 'Reed Pond',
  deck: 'D',
  number: 78,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Place 1 <REED> on each of the next 3 round spaces. At the start of these rounds, you get the <REED>.'],
  cost: {},
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
