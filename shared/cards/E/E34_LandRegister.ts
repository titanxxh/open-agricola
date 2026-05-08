import type { CardImpl } from '../registry'
import { E34_LandRegister } from '../../cards-display/E/E34_LandRegister'

const CARD_ID = E34_LandRegister.id

export const E34_LandRegister_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const usedTiles = new Set<string>()
    player.roomTiles.forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    player.fields.forEach((f) => usedTiles.add(`${f.row},${f.col}`))
    player.stableTiles.forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    player.pastures.flatMap((p) => p.tiles).forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    return usedTiles.size >= 15 ? 2 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
