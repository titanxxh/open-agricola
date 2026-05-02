import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A36_FacadesCarving'

// Maps current round to number of completed harvests
const HARVEST_MAP: Record<number, number> = {
  1: 0, 2: 0, 3: 0, 4: 0,
  5: 1, 6: 1, 7: 1,
  8: 2, 9: 2,
  10: 3, 11: 3,
  12: 4, 13: 4,
  14: 5,
}

export const A36_FacadesCarving = new MinorImprovement({
  id: CARD_ID,
  name: 'Facades Carving',
  deck: 'A',
  number: 36,
  category: 'POINTS_PROVIDER',
  desc: ['When you play this card, you can exchange any number of <FOOD> for 1 bonus <SCORE> each, up to the number of completed harvests.'],
  cost: { clay: 2 },
  prerequisite: 'Wood in Your Supply >= Current Round',
  extraVp: true,
  newSet: true,
})

export const A36_FacadesCarving_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state) => {
    const n = HARVEST_MAP[state.round] ?? 0
    if (n <= 0) return
    // XOR: pay i food → i bonus VP (i from 1 to n)
    const children = Array.from({ length: n }, (_, idx) => {
      const i = idx + 1
      const bonusVpLeaves = Array.from({ length: i }, () => ({
        type: 'leaf' as const,
        actionId: 'bonus-vp',
        sourceCard: CARD_ID,
      }))
      return {
        type: 'seq' as const,
        children: [
          {
            type: 'leaf' as const,
            actionId: 'pay',
            sourceCard: CARD_ID,
            params: { food: i },
          },
          ...bonusVpLeaves,
        ],
      }
    })
    return {
      type: 'xor' as const,
      optional: true,
      children,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
