import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'E45_FruitLadder'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const evenRounds = [2, 4, 6, 8, 10, 12, 14].filter((r) => r > state.round)
    if (evenRounds.length === 0) return

    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: evenRounds.map((round) => ({ round, resources: { food: 1 } })),
    })
    return futureMeeplesNode()
  },
})

export const E45_FruitLadder = new MinorImprovement({
  id: CARD_ID,
  name: 'Fruit Ladder',
  deck: 'E',
  number: 45,
  category: 'FOOD_MISC',
  desc: ['Place 1 <FOOD> on each remaining even-numbered round space. At the start of these rounds, you get the <FOOD>.'],
  vp: 1,
  cost: { wood: 2 },
})
