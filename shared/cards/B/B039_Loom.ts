import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getAssignedAnimalsByType } from '../../domain/animals'
import type { CardImpl } from '../registry'

const CARD_ID = 'B039_Loom'
const sheepFoodIncome = (sheep: number): number => {
  const map = [0, 1, 1, 1, 2, 2, 2, 3]
  return map[Math.min(sheep, 7)] ?? 3
}

const cardImpl = {
  effect: {
  id: CARD_ID,
  onHarvestFieldPhase: (state, player) => {
    const sheep = getAssignedAnimalsByType(player, state).sheep
    const gain = sheepFoodIncome(sheep)
    if (gain <= 0) return
    return gainLeaf(CARD_ID, { food: gain })
  },
  computeBonusScore: (state, player) => {
    const sheep = getAssignedAnimalsByType(player, state).sheep
    return Math.floor(sheep / 3)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B039_Loom = defineMinorCard({
  meta: {
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
    extraVp: true,
  },
  impl: cardImpl,
})

export const B039_Loom_impl = B039_Loom.impl
