import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A136_DrudgeryReeve'

// BGA: remaining turns → wood gained on buy
// 14 total rounds; remainingTurns = 14 - currentRound
const WOOD_BY_REMAINING: number[] = [0, 1, 1, 2, 2, 2, 3, 3, 3, 4]

// BGA: sets of building resources → bonus VP
const BONUS_BY_SETS: number[] = [0, 1, 3, 5]

export const A136_DrudgeryReeve = new Occupation({
  id: CARD_ID,
  name: "Drudgery Reeve",
  deck: "A",
  number: 136,
  category: "POINTS_PROVIDER",
  desc: ["If there are still 1/3/6/9 complete rounds left to play, you immediately get 1/2/3/4 <WOOD>. During scoring, each player with 1+/2+/3+ building resources of each type gets 1/3/5 bonus <SCORE>."],
  cost: {},
  players: "3+",
})

export const A136_DrudgeryReeve_impl = {
  effect: {
  id: CARD_ID,
  scoringPriority: 0, // before Soldier (priority 10) — higher marginal value per set
  onBuy: (state, _player) => {
    const remainingTurns = 14 - state.round
    const wood = WOOD_BY_REMAINING[remainingTurns] ?? (remainingTurns >= 9 ? 4 : 0)
    if (wood > 0) {
      return gainLeaf(CARD_ID, { wood })
    }
  },
  computeBonusScore: (_state, player, ctx) => {
    const wood = (player.resources.wood ?? 0) - (ctx.reserved.wood ?? 0)
    const clay = (player.resources.clay ?? 0) - (ctx.reserved.clay ?? 0)
    const stone = (player.resources.stone ?? 0) - (ctx.reserved.stone ?? 0)
    const reed = (player.resources.reed ?? 0) - (ctx.reserved.reed ?? 0)
    const sets = Math.max(0, Math.min(wood, clay, stone, reed, 3))
    if (sets > 0) {
      ctx.reserved.wood = (ctx.reserved.wood ?? 0) + sets
      ctx.reserved.clay = (ctx.reserved.clay ?? 0) + sets
      ctx.reserved.stone = (ctx.reserved.stone ?? 0) + sets
      ctx.reserved.reed = (ctx.reserved.reed ?? 0) + sets
    }
    return BONUS_BY_SETS[sets] ?? 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
