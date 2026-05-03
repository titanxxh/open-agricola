import { MinorImprovement } from '../types'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import { countUnusedFarmyardSpaces } from '../../game/farm'
import type { CardImpl } from '../registry'

const CARD_ID = 'A57_MilkingParlor'

// BGA isBuyable: count(getFreeZones()) < 4 → false
registerPrerequisite('At Least 4 Unused Farmyard Spaces', (player) =>
  countUnusedFarmyardSpaces(player) >= 4,
)

export const A57_MilkingParlor = new MinorImprovement({
  id: CARD_ID,
  name: 'Milking Parlor',
  deck: 'A',
  number: 57,
  category: 'FOOD_PROVIDER',
  desc: ['When you play this card, if you have at least 1/3/4 <SHEEP>, you immediately get 2/3/4 <FOOD>. The same applies if you have at least 1/2/3 <CATTLE>.'],
  cost: { wood: 2 },
  vp: 1,
  prerequisite: 'At Least 4 Unused Farmyard Spaces',
  newSet: true,
})

export const A57_MilkingParlor_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const sheepFood = [0, 2, 2, 3, 4]
    const cattleFood = [0, 2, 3, 4]
    const sheep = Math.min(player.resources.sheep, 4)
    const cattle = Math.min(player.resources.cattle, 3)
    const n = sheepFood[sheep]! + cattleFood[cattle]!
    if (n <= 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { food: n },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
