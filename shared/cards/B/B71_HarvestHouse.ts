import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B71_HarvestHouse } from '../../cards-display/B/B71_HarvestHouse'
export { B71_HarvestHouse }

const CARD_ID = B71_HarvestHouse.id

const HARVEST_MAP: Record<number, number> = {
  1: 0, 2: 0, 3: 0, 4: 0,
  5: 1, 6: 1, 7: 1,
  8: 2, 9: 2,
  10: 3, 11: 3,
  12: 4, 13: 4,
  14: 5,
}

export const B71_HarvestHouse_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const occs = player.occupationPlayed.length
    const harvests = HARVEST_MAP[state.round] ?? 0
    if (occs !== harvests) return
    return gainLeaf(CARD_ID, { food: 1, grain: 1, vegetable: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
