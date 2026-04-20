import { Occupation } from '../types'
import { payLeaf } from '../helpers/pay-gain-node'
import { spaceHasPlayer } from '../../game/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'A100_Curator'

export const A100_Curator = new Occupation({
  id: CARD_ID,
  name: 'Curator',
  deck: 'A',
  number: 100,
  category: 'POINTS_PROVIDER',
  desc: ['In the returning home phase of each round, if you return at least 3 people from accumulation spaces, you can buy 1 bonus <SCORE> for 1 <FOOD>.'],
  cost: {},
  players: '1+',
  evenMoreSet: true,
})

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
