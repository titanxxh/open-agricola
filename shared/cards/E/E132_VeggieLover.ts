import { Occupation } from '../types'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E132_VeggieLover'

export const E132_VeggieLover = new Occupation({
  id: CARD_ID,
  name: "Veggie Lover",
  deck: "E",
  number: 132,
  category: "BONUS_POINTS",
  desc: [
    '[Harvest]',
    '<GRAIN_VEG_STACK> <ARROW-1X> 6<FOOD>',
    '[Scoring]',
    '1/2/3 <GRAIN_VEG_STACK> <ARROW-1X> 2/4/6 <SCORE>',
  ],
  cost: {},
  players: "3+",
})

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
  computeBonusScore: (_state, player, ctx) => {
    const grain = (player.resources.grain ?? 0) - (ctx.reserved.grain ?? 0)
    const veg = (player.resources.vegetable ?? 0) - (ctx.reserved.vegetable ?? 0)
    const sets = Math.min(grain, veg, 3)
    if (sets > 0) {
      ctx.reserved.grain = (ctx.reserved.grain ?? 0) + sets
      ctx.reserved.vegetable = (ctx.reserved.vegetable ?? 0) + sets
    }
    return sets * 2
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
