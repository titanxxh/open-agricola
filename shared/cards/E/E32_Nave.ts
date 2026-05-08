import type { CardImpl } from '../registry'
import { E32_Nave } from '../../cards-display/E/E32_Nave'
export { E32_Nave }

const CARD_ID = E32_Nave.id

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
