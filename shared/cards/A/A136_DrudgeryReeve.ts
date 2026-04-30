import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import type { BonusScoreLevel } from '../card-effects'

const CARD_ID = 'A136_DrudgeryReeve'

const WOOD_BY_REMAINING: number[] = [0, 1, 1, 2, 2, 2, 3, 3, 3, 4]

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
  extraVp: true,
})

export const A136_DrudgeryReeve_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, _player) => {
      const remainingTurns = 14 - state.round
      const wood = WOOD_BY_REMAINING[remainingTurns] ?? (remainingTurns >= 9 ? 4 : 0)
      if (wood > 0) {
        return gainLeaf(CARD_ID, { wood })
      }
    },
    computeCostedBonus: (_state, player, _ctx) => {
      const wood = player.resources.wood ?? 0
      const clay = player.resources.clay ?? 0
      const stone = player.resources.stone ?? 0
      const reed = player.resources.reed ?? 0
      const maxSets = Math.max(0, Math.min(wood, clay, stone, reed, 3))
      const levels: BonusScoreLevel[] = []
      for (let k = 0; k <= maxSets; k++) {
        levels.push({
          cost: k === 0 ? {} : { wood: k, clay: k, stone: k, reed: k },
          score: BONUS_BY_SETS[k] ?? 0,
        })
      }
      return levels
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
