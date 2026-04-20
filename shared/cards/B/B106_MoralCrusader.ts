import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B106_MoralCrusader'

export const B106_MoralCrusader = new Occupation({
  id: CARD_ID,
  name: 'Moral Crusader',
  deck: 'B',
  number: 106,
  category: 'FOOD_PROVIDER',
  desc: ['Immediately before the start of each round, if there are goods on the remaining round spaces that are promised to you, you get 1 <FOOD>.'],
  cost: {},
  players: '1+',
  newSet: true,
})

export const B106_MoralCrusader_impl = {
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (state, player) => {
    // Check if player has any future meeple entries (goods promised for future rounds)
    const upcomingRound = state.round + 1
    const hasFutureGoods = state.futureMeeples.some(
      (entry) => entry.playerId === player.id &&
                 entry.round >= upcomingRound &&
                 Object.values(entry.resources ?? {}).some((v) => (v as number) > 0),
    )
    if (!hasFutureGoods) return
    return gainLeaf(CARD_ID, { food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
