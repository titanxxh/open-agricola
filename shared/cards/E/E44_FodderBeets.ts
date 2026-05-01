import { MinorImprovement } from '../types'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'E44_FodderBeets'

export const E44_FodderBeets = new MinorImprovement({
  id: CARD_ID,
  name: 'Fodder Beets',
  deck: 'E',
  number: 44,
  category: 'FOOD_-_FUTURE_ROUND_SPACES',
  desc: ['Place 1 <FOOD> on each remaining odd-numbered round space. At the start of these rounds, you get the <FOOD>.'],
  vp: 1,
  prerequisite: '3 Field Tiles',
})

export const E44_FodderBeets_impl = {
  effect: {
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
