import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'
import { collectCardDefinitionsAs } from '../helpers/card-type'
import { countsForMoorBalanceRules } from '../helpers/moor-balance'

const CARD_ID = 'B153_Housemaster'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (state, player) => {
      const majorVps = collectCardDefinitionsAs(player, 'major')
        .filter(def => countsForMoorBalanceRules(state, def.id))
        .map((def) => def.vp ?? 0)
        .filter((vp) => vp > 0)
      if (majorVps.length === 0) return 0
      const sum = majorVps.reduce((a, b) => a + b, 0)
      const min = Math.min(...majorVps)
      const total = sum + min
      if (total >= 11) return 4
      if (total >= 9) return 3
      if (total >= 7) return 2
      if (total >= 5) return 1
      return 0
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B153_Housemaster = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Housemaster",
    deck: "B",
    number: 153,
    category: "POINTS_PROVIDER",
    desc: ['During scoring, total the base point values of your major improvements. The smallest value counts double. If the total is at least 5/7/9/11, you get 1/2/3/4 bonus <SCORE>.'],
    cost: {},
    players: "4+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const B153_Housemaster_impl = B153_Housemaster.impl
