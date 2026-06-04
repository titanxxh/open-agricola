import { defineMinorCard } from '../card-source'
import { countUnusedFarmyardSpaces } from '../../domain/farm'
import type { CardImpl } from '../registry'

const CARD_ID = 'A57_MilkingParlor'

const cardImpl = {
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
  prerequisiteCheck: (player) => countUnusedFarmyardSpaces(player) >= 4,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A57_MilkingParlor = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Milking Parlor',
    deck: 'A',
    number: 57,
    category: 'FOOD_PROVIDER',
    desc: ['When you play this card, if you have at least 1/3/4 <SHEEP>, you immediately get 2/3/4 <FOOD>. The same applies if you have at least 1/2/3 <CATTLE>.'],
    cost: { wood: 2 },
    vp: 1,
    prerequisite: 'At Least 4 Unused Farmyard Spaces',
  },
  impl: cardImpl,
})

export const A57_MilkingParlor_impl = A57_MilkingParlor.impl
