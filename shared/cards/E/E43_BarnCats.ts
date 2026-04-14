import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'E43_BarnCats'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const stables = player.stableTiles.length
    if (stables === 0) return

    // 1 stable → 2 rounds, 2 → 3, 3 → 4, 4 → 5
    const count = Math.min(stables + 1, 5)

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

export const E43_BarnCats = new MinorImprovement({
  id: CARD_ID,
  name: 'Barn Cats',
  deck: 'E',
  number: 43,
  category: 'FOOD_MISC',
  desc: ['If you have 1/2/3/4 stables, place 1 <FOOD> on each of the next 2/3/4/5 round spaces. At the start of these rounds, you get the <FOOD>.'],
  vp: 1,
  prerequisite: '1 Stable',
})
