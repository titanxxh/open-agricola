import type { CardImpl } from '../registry'
import type { BonusScoreLevel } from '../card-effects'
import { D132_HideFarmer } from '../../cards-display/D/D132_HideFarmer'
export { D132_HideFarmer }

const CARD_ID = D132_HideFarmer.id

export const D132_HideFarmer_impl = {
  effect: {
    id: CARD_ID,
    computeCostedBonus: (_state, _player, ctx) => {
      const emptyCat = ctx.categories.find((c) => c.key === 'empty')
      if (!emptyCat || emptyCat.total >= 0) return [{ cost: {}, score: 0 }]
      const penalty = Math.abs(emptyCat.total)
      const levels: BonusScoreLevel[] = []
      for (let k = 0; k <= penalty; k++) {
        levels.push({
          cost: k === 0 ? {} : { food: k },
          score: k,
        })
      }
      return levels
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
