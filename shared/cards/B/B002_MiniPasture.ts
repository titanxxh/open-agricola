import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'B002_MiniPasture'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'leaf' as const,
    actionId: 'fence',
    sourceCard: CARD_ID,
    actionContext: {
      fencePolicy: {
        segmentBounds: { total: { min: 1, max: 4 } },
        newPastureBounds: {
          count: { min: 1, max: 1 },
          totalSize: { min: 1, max: 1 },
        },
        costPolicy: { fence: { wood: 0 } },
      },
    },
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B002_MiniPasture = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Mini Pasture",
    deck: "B",
    number: 2,
    category: "FARM_PLANNER",
    desc: ["Immediately fence a farmyard space, without paying <WOOD> for the fences. (If you already have pastures, the new one must be adjacent to an existing one.)"],
    cost: { food: 2 },
    passing: true,
  },
  impl: cardImpl,
})

export const B002_MiniPasture_impl = B002_MiniPasture.impl
