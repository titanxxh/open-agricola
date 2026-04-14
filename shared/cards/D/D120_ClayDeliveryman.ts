import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'D120_ClayDeliveryman'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    // Place 1 clay on each remaining space for rounds 6 to 14
    const absoluteRounds = [6, 7, 8, 9, 10, 11, 12, 13, 14]
    const entries = absoluteRounds
      .filter((r) => r > state.round)
      .map((round) => ({ round, resources: { clay: 1 } }))

    if (entries.length === 0) return
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries,
    })
    return futureMeeplesNode()
  },
})

export const D120_ClayDeliveryman = new Occupation({
  id: CARD_ID,
  name: 'Clay Deliveryman',
  deck: 'D',
  number: 120,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Place 1 <CLAY> on each remaining space for rounds 6 to 14. At the start of these rounds, you get the <CLAY>.'],
  cost: {},
  players: '1+',
})
