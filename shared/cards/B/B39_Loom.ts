import { gainLeaf } from '../helpers/pay-gain-node'
import { getAssignedAnimalsByType } from '../../domain/animals'
import type { CardImpl } from '../registry'
import { B39_Loom } from '../../cards-display/B/B39_Loom'
export { B39_Loom }

const CARD_ID = B39_Loom.id

const sheepFoodIncome = (sheep: number): number => {
  const map = [0, 1, 1, 1, 2, 2, 2, 3]
  return map[Math.min(sheep, 7)] ?? 3
}

export const B39_Loom_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFieldPhase: (_state, player) => {
    const sheep = getAssignedAnimalsByType(player).sheep
    const gain = sheepFoodIncome(sheep)
    if (gain <= 0) return
    return gainLeaf(CARD_ID, { food: gain })
  },
  computeBonusScore: (_state, player) => {
    const sheep = getAssignedAnimalsByType(player).sheep
    return Math.floor(sheep / 3)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
