import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'E44_FodderBeets'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const oddRounds = [3, 5, 7, 9, 11, 13].filter((r) => r > state.round)
    if (oddRounds.length === 0) return

    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: oddRounds.map((round) => ({ round, resources: { food: 1 } })),
    })
    return futureMeeplesNode()
  },
})

export const E44_FodderBeets = new MinorImprovement({
  id: CARD_ID,
  name: 'Fodder Beets',
  deck: 'E',
  number: 44,
  category: 'FOOD_MISC',
  desc: ['Place 1 <FOOD> on each remaining odd-numbered round space. At the start of these rounds, you get the <FOOD>.'],
  vp: 1,
  prerequisite: '3 Field Tiles',
})
