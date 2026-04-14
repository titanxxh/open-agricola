import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'

const CARD_ID = 'B74_ThickForest'

// BGA: place 1 wood on each remaining even-numbered round space.
registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const evenRounds = [2, 4, 6, 8, 10, 12, 14].filter((r) => r > state.round)
    if (evenRounds.length === 0) return
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: evenRounds.map((round) => ({ round, resources: { wood: 1 } })),
    })
  },
})

export const B74_ThickForest = new MinorImprovement({
  id: CARD_ID,
  name: 'Thick Forest',
  deck: 'B',
  number: 74,
  category: 'RESOURCE_WOOD',
  desc: ['Place 1 <WOOD> on each remaining even-numbered round space. At the start of these rounds, you get the <WOOD>.'],
  cost: {},
  prerequisite: '5 Clay in Your Supply',
})
