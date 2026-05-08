import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getAssignedAnimalsByType } from '../../domain/animals'
import type { CardImpl } from '../registry'

const CARD_ID = 'B39_Loom'

// BGA: foodMap = [0,1,1,1,2,2,2,3]; index = countAnimalsOnBoard()[SHEEP] (clamped to 7)
const sheepFoodIncome = (sheep: number): number => {
  const map = [0, 1, 1, 1, 2, 2, 2, 3]
  return map[Math.min(sheep, 7)] ?? 3
}

export const B39_Loom = new MinorImprovement({
  id: CARD_ID,
  name: "Loom",
  deck: "B",
  number: 39,
  category: "POINTS_PROVIDER",
  desc: ['In the field phase of each harvest, if you have at least 1/4/7 <SHEEP>, you get 1/2/3 <FOOD>. During scoring, you get 1 bonus <SCORE> for every 3 <SHEEP>.'],
  cost: { wood: 2 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  vp: 1,
})

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
