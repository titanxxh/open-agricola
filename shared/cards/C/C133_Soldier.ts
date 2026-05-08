import type { CardImpl } from '../registry'
import type { BonusScoreLevel } from '../card-effects'
import { C133_Soldier } from '../../cards-display/C/C133_Soldier'
export { C133_Soldier }

const CARD_ID = C133_Soldier.id

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
