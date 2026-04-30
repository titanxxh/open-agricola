import { Occupation } from '../types'
import type { CardImpl } from '../registry'
import type { BonusScoreLevel } from '../card-effects'

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
    computeCostedBonus: (_state, player, _ctx) => {
      const wood = player.resources.wood ?? 0
      const stone = player.resources.stone ?? 0
      const maxPairs = Math.max(0, Math.min(wood, stone))
      const levels: BonusScoreLevel[] = []
      for (let k = 0; k <= maxPairs; k++) {
        levels.push({
          cost: k === 0 ? {} : { wood: k, stone: k },
          score: k,
        })
      }
      return levels
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
