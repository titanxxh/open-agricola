import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D38_MilkingStool } from '../../cards-display/D/D38_MilkingStool'

const CARD_ID = D38_MilkingStool.id

const cattleFoodIncome = (cattle: number): number => {
  if (cattle >= 5) return 3
  if (cattle >= 3) return 2
  if (cattle >= 1) return 1
  return 0
}

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
