import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E132_VeggieLover'

registerCardEffect({
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
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
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    const grain = (player.resources.grain ?? 0) - (ctx.reserved.grain ?? 0)
    const veg = (player.resources.vegetable ?? 0) - (ctx.reserved.vegetable ?? 0)
    const sets = Math.min(grain, veg, 3)
    if (sets > 0) {
      ctx.reserved.grain = (ctx.reserved.grain ?? 0) + sets
      ctx.reserved.vegetable = (ctx.reserved.vegetable ?? 0) + sets
    }
    return sets * 2
  },
})

export const E132_VeggieLover = new Occupation({
  id: CARD_ID,
  name: "Veggie Lover",
  deck: "E",
  number: 132,
  category: "POINTS_PROVIDER",
  desc: ['During the feeding phase: pay 1 <GRAIN> + 1 <VEGETABLE> → 6 <FOOD>. Scoring: 1/2/3 grain+vegetable sets → 2/4/6 bonus VP.'],
  cost: {},
  players: "3+",
})
