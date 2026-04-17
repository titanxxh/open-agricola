import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { payLeaf } from '../helpers/pay-gain-node'
import { spaceHasPlayer } from '../../game/space'

const CARD_ID = 'A100_Curator'

// A100 Curator: In the returning home phase of each round, if you return at least 3 people
// from accumulation spaces, you can buy 1 bonus VP for 1 food.
registerCardEffect({
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
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
})

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
