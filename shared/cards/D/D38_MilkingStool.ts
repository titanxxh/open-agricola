import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D38_MilkingStool'

const cattleFoodIncome = (cattle: number): number => {
  if (cattle >= 5) return 3
  if (cattle >= 3) return 2
  if (cattle >= 1) return 1
  return 0
}

export const D38_MilkingStool = new MinorImprovement({
  id: CARD_ID,
  name: "Milking Stool",
  deck: "D",
  number: 38,
  category: "POINTS_PROVIDER",
  desc: [
    'In the field phase of each harvest, if you have at least 1/3/5 <CATTLE>, you get 1/2/3 <FOOD>. During scoring, you get 1 bonus <SCORE> for every 2 <CATTLE> you have.',
  ],
  cost: { wood: 1 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})

export const D38_MilkingStool_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFieldPhase: (_state, player) => {
    const gain = cattleFoodIncome(player.resources.cattle ?? 0)
    if (gain <= 0) return
    return gainLeaf(CARD_ID, { food: gain })
  },
  computeBonusScore: (_state, player) => {
    return Math.floor(player.resources.cattle / 2)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
