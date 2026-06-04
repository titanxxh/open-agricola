import { defineMinorCard } from '../card-source'
import { hasNoUnusedFarmyardSpaces } from '../../domain/farm'
import type { CardImpl } from '../registry'

const CARD_ID = 'A33_BigCountry'

const cardImpl = {
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
  prerequisiteCheck: hasNoUnusedFarmyardSpaces,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A33_BigCountry = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Big Country',
    deck: 'A',
    number: 33,
    category: 'POINTS_PROVIDER',
    desc: ['For each complete round left to play, you immediately get 1 bonus <SCORE> and 2 <FOOD>.'],
    cost: {},
    prerequisite: 'All Farmyard Spaces Used',
    extraVp: true,
  },
  impl: cardImpl,
})

export const A33_BigCountry_impl = A33_BigCountry.impl
