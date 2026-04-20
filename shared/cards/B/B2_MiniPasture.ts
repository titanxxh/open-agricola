import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B2_MiniPasture'

export const B2_MiniPasture = new MinorImprovement({
  id: CARD_ID,
  name: "Mini Pasture",
  deck: "B",
  number: 2,
  category: "FARM_PLANNER",
  desc: ["Immediately fence a farmyard space, without paying <WOOD> for the fences. (If you already have pastures, the new one must be adjacent to an existing one.)"],
  cost: { food: 2 },
  passing: true,
})

export const B2_MiniPasture_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'leaf' as const,
    actionId: 'fencing',
    sourceCard: CARD_ID,
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
