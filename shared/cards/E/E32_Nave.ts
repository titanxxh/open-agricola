import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E32_Nave'

export const E32_Nave = new MinorImprovement({
  id: CARD_ID,
  name: "Nave",
  deck: "E",
  number: 32,
  category: "POINTS_PROVIDER",
  desc: ['During scoring, you get 1 bonus <SCORE> for each of the 5 columns of your farmyard board containing at least one room.'],
  cost: { stone: 2, reed: 1 },
  vp: 0,
})

export const E32_Nave_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const cols = new Set(player.roomTiles.map((t) => t.col))
    return cols.size
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
