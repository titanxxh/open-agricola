import { countUnusedFarmyardSpaces } from '../../domain/farm'
import type { CardImpl } from '../registry'
import { A57_MilkingParlor } from '../../cards-display/A/A57_MilkingParlor'

const CARD_ID = A57_MilkingParlor.id

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
  prerequisiteCheck: (player) => countUnusedFarmyardSpaces(player) >= 4,
  reaches: [] as readonly string[],
} satisfies CardImpl
