import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'A33_BigCountry'

// BGA: prerequisite = all farmyard spaces used.
// For each complete round left to play, get 1 bonus SCORE and 2 FOOD.
registerCardEffect({
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
})

export const A33_BigCountry = new MinorImprovement({
  id: CARD_ID,
  name: 'Big Country',
  deck: 'A',
  number: 33,
  category: 'POINTS_PROVIDER',
  desc: ['For each complete round left to play, you immediately get 1 bonus <SCORE> and 2 <FOOD>.'],
  cost: {},
  prerequisite: 'All Farmyard Spaces Used',
  extraVp: true,
})
