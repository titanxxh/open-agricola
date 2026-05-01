import { MinorImprovement } from '../types'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'B74_ThickForest'

export const B74_ThickForest = new MinorImprovement({
  id: CARD_ID,
  name: 'Thick Forest',
  deck: 'B',
  number: 74,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Place 1 <WOOD> on each remaining even-numbered round space. At the start of these rounds, you get the <WOOD>.'],
  cost: {},
  prerequisite: '5 Clay in Your Supply',
})

export const B74_ThickForest_impl = {
  effect: {
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
