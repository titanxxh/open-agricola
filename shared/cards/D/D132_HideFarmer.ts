import { Occupation } from '../types'
import type { CardImpl } from '../registry'
import type { BonusScoreLevel } from '../card-effects'

const CARD_ID = 'D132_HideFarmer'

export const D132_HideFarmer = new Occupation({
  id: CARD_ID,
  name: "Hide Farmer",
  deck: "D",
  number: 132,
  category: "POINTS_PROVIDER",
  desc: ['During scoring, you can pay 1 <FOOD> each for any number of unused farmyard spaces. You do not lose points for these spaces.'],
  cost: {},
  players: "3+",
})

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
