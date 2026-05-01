import { MinorImprovement } from '../types'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'A69_LargeGreenhouse'

export const A69_LargeGreenhouse = new MinorImprovement({
  id: CARD_ID,
  name: 'Large Greenhouse',
  deck: 'A',
  number: 69,
  category: 'CROP_PROVIDER',
  desc: ['Add 4, 7, and 9 to the current round and place 1 <VEGETABLE> on each corresponding round space. At the start of these rounds, you get the <VEGETABLE>.'],
  cost: { wood: 2 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})

export const A69_LargeGreenhouse_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const offsets = [4, 7, 9]
    const entries = offsets
      .map((offset) => ({ round: state.round + offset, resources: { vegetable: 1 } }))
      .filter((e) => e.round <= 14)
    if (entries.length === 0) return
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries,
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
