import { gainLeaf } from '../helpers/pay-gain-node'
import { getAssignedAnimalsByType } from '../../domain/animals'
import type { CardImpl } from '../registry'
import { B50_ButterChurn } from '../../cards-display/B/B50_ButterChurn'

const CARD_ID = B50_ButterChurn.id

export const B50_ButterChurn_impl = {
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
