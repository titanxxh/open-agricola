import { defineMinorCard } from '../card-source'
import { hasNoUnusedFarmyardSpaces } from '../../domain/farm'
import type { CardImpl } from '../registry'
import { bonusVpLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A033_BigCountry'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state) => {
    const nb = 14 - state.round
    if (nb <= 0) return
    return {
      type: 'seq' as const,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'gain',
          sourceCard: CARD_ID,
          params: { food: 2 * nb },
        },
        bonusVpLeaf(CARD_ID, nb),
      ],
    }
  },
},
  prerequisiteCheck: hasNoUnusedFarmyardSpaces,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A033_BigCountry = defineMinorCard({
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
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const A033_BigCountry_impl = A033_BigCountry.impl
