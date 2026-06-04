import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getAssignedAnimalsByType } from '../../domain/animals'
import type { CardImpl } from '../registry'

const CARD_ID = 'B50_ButterChurn'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onHarvestFieldPhase: (_state, player) => {
    const animals = getAssignedAnimalsByType(player)
    const gain = Math.floor(animals.sheep / 3) + Math.floor(animals.cattle / 2)
    if (gain <= 0) return
    return gainLeaf(CARD_ID, { food: gain })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B50_ButterChurn = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Butter Churn",
    deck: "B",
    number: 50,
    category: "FOOD_PROVIDER",
    desc: ["In the field phase of each harvest, you get 1 <FOOD> for every 3 <SHEEP> and 1 <FOOD> for every 2 <CATTLE> you have."],
    vp: 1,
    cost: { wood: 1 },
    prerequisite: "At Most 3 Occupations",
    occupationPrerequisites: { max: 3 },
  },
  impl: cardImpl,
})

export const B50_ButterChurn_impl = B50_ButterChurn.impl
