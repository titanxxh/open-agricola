import { MinorImprovement } from '../types'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'B78_ReedBelt'

export const B78_ReedBelt = new MinorImprovement({
  id: CARD_ID,
  name: 'Reed Belt',
  deck: 'B',
  number: 78,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Place 1 <REED> on each of the remaining space for rounds 5, 8, 10, and 12. At the start of these rounds, you get the <REED>.'],
  cost: { food: 2 },
})

export const B78_ReedBelt_impl = {
  effect: {
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
