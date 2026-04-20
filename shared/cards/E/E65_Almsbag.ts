import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E65_Almsbag'

export const E65_Almsbag = new MinorImprovement({
  id: CARD_ID,
  name: 'Almsbag',
  deck: 'E',
  number: 65,
  category: 'FOOD_GRAIN',
  desc: ['When you play this card, you immediately get 1 <GRAIN> for every 2 completed rounds.'],
  prerequisite: 'No Occupations',
  occupationPrerequisites: { max: 0 },
})

export const E65_Almsbag_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state) => {
    // 1 grain for every 2 completed rounds: floor((round - 1) / 2)
    const grainCount = Math.floor((state.round - 1) / 2)
    if (grainCount <= 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { grain: grainCount },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
