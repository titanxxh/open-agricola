import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B106_MoralCrusader'

// B106 Moral Crusader: Immediately before the start of each round, if there are goods
// on the remaining round spaces that are promised to you, you get 1 food.
// In our engine, "goods promised to you on round spaces" maps to future meeples (futureMeeples)
// entries that belong to this player for future rounds.
registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
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
})

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
