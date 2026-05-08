import { payLeaf } from '../helpers/pay-gain-node'
import { spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'
import { A100_Curator } from '../../cards-display/A/A100_Curator'

const CARD_ID = A100_Curator.id

export const A100_Curator_impl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    // Count farmers on accumulation spaces (spaces with gainPerRound resources)
    const farmersOnAccumulation = state.actionSpaces.filter(
      (s) => spaceHasPlayer(s, player.id) && Object.values(s.resources ?? {}).some((v) => v > 0),
    ).length
    if (farmersOnAccumulation < 3) return
    if ((player.resources.food ?? 0) < 1) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
