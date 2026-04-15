import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'

const CARD_ID = 'B78_ReedBelt'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const targetRounds = [5, 8, 10, 12].filter((r) => r > state.round)
    if (targetRounds.length === 0) return
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: targetRounds.map((round) => ({ round, resources: { reed: 1 } })),
    })
  },
})

export const B78_ReedBelt = new MinorImprovement({
  id: CARD_ID,
  name: 'Reed Belt',
  deck: 'B',
  number: 78,
  category: 'RESOURCE_REED',
  desc: ['Place 1 <REED> on each of the remaining space for rounds 5, 8, 10, and 12. At the start of these rounds, you get the <REED>.'],
  cost: { food: 2 },
})
