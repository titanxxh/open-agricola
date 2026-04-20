import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C1_Overhaul'

export const C1_Overhaul = new MinorImprovement({
  id: CARD_ID,
  name: "Overhaul",
  deck: "C",
  number: 1,
  category: "FARM_PLANNER",
  desc: ["Immediately raze all of your fences, add up to 3 fences from your supply, and rebuild them. (You do not lose any animals during this.)"],
  cost: { wood: 1 },
  prerequisite: "2 Occupations",
  occupationPrerequisites: { min: 2 },
  passing: true,
  newSet: true,
})

export const C1_Overhaul_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return {
      type: 'seq' as const,
      optional: true,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'fencing',
          sourceCard: CARD_ID,
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
