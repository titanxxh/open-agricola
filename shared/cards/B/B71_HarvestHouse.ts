import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B71_HarvestHouse'

// BGA: if completed harvests == occupations played, gain food+grain+vegetable.
// Harvest map: rounds 1-4 → 0 harvests, 5-7 → 1, 8-9 → 2, 10-11 → 3, 12-13 → 4, 14 → 5.
const HARVEST_MAP: Record<number, number> = {
  1: 0, 2: 0, 3: 0, 4: 0,
  5: 1, 6: 1, 7: 1,
  8: 2, 9: 2,
  10: 3, 11: 3,
  12: 4, 13: 4,
  14: 5,
}

export const B71_HarvestHouse = new MinorImprovement({
  id: CARD_ID,
  name: 'Harvest House',
  deck: 'B',
  number: 71,
  category: 'CROP_PROVIDER',
  desc: ['When you play this card, if the number of completed harvests is equal to the number of occupations you played, you immediately get 1 <FOOD>, 1 <GRAIN>, and 1 <VEGETABLE>.'],
  cost: { wood: 1, clay: 1, reed: 1 },
  vp: 2,
})

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
