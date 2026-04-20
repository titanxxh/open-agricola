import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C133_Soldier'

export const C133_Soldier = new Occupation({
  id: CARD_ID,
  name: "Soldier",
  deck: "C",
  number: 133,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each <STONE> + <WOOD> pair in your supply. You cannot score additional points for the resources scored with this card."],
  cost: {},
  players: "3+",
  newSet: true,
})

export const C133_Soldier_impl = {
  effect: {
  id: CARD_ID,
  scoringPriority: 10, // after DrudgeryReeve (priority 0)
  computeBonusScore: (_state, player, ctx) => {
    const wood = (player.resources.wood ?? 0) - (ctx.reserved.wood ?? 0)
    const stone = (player.resources.stone ?? 0) - (ctx.reserved.stone ?? 0)
    const pairs = Math.max(0, Math.min(wood, stone))
    if (pairs > 0) {
      ctx.reserved.wood = (ctx.reserved.wood ?? 0) + pairs
      ctx.reserved.stone = (ctx.reserved.stone ?? 0) + pairs
    }
    return pairs
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
