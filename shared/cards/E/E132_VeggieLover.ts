import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import type { BonusScoreLevel } from '../card-effects'
import { E132_VeggieLover } from '../../cards-display/E/E132_VeggieLover'
export { E132_VeggieLover }

const CARD_ID = E132_VeggieLover.id

export const E132_VeggieLover_impl = {
  effect: {
    id: CARD_ID,
    onHarvestFeedingPhase: (_state, player) => {
      if (player.resources.grain < 1 || player.resources.vegetable < 1) return
      return {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1, vegetable: 1 } }),
          gainLeaf(CARD_ID, { food: 6 }),
        ],
      }
    },
    computeCostedBonus: (_state, player, _ctx) => {
      const grain = player.resources.grain ?? 0
      const veg = player.resources.vegetable ?? 0
      const maxStacks = Math.max(0, Math.min(grain, veg, 3))
      const BONUS_BY_STACKS = [0, 2, 4, 6]
      const levels: BonusScoreLevel[] = []
      for (let k = 0; k <= maxStacks; k++) {
        levels.push({
          cost: k === 0 ? {} : { grain: k, vegetable: k },
          score: BONUS_BY_STACKS[k] ?? 0,
        })
      }
      return levels
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
