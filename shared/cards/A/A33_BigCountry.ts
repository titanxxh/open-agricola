import { registerPrerequisite } from '../helpers/prerequisite-registry'
import { hasNoUnusedFarmyardSpaces } from '../../domain/farm'
import type { CardImpl } from '../registry'
import { A33_BigCountry } from '../../cards-display/A/A33_BigCountry'

const CARD_ID = A33_BigCountry.id

registerPrerequisite('All Farmyard Spaces Used', hasNoUnusedFarmyardSpaces)

export const A33_BigCountry_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state) => {
    const nb = 14 - state.round
    if (nb <= 0) return
    const bonusVpLeaves = Array.from({ length: nb }, () => ({
      type: 'leaf' as const,
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    }))
    return {
      type: 'seq' as const,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'gain',
          sourceCard: CARD_ID,
          params: { food: 2 * nb },
        },
        ...bonusVpLeaves,
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
