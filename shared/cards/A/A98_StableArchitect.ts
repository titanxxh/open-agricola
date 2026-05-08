import type { CardImpl } from '../registry'
import { A98_StableArchitect } from '../../cards-display/A/A98_StableArchitect'

const CARD_ID = A98_StableArchitect.id

export const A98_StableArchitect_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const pastureStableTiles = new Set(
      player.pastures.flatMap((p) => p.tiles.map((t) => `${t.row},${t.col}`))
    )
    return player.stableTiles.filter((t) => !pastureStableTiles.has(`${t.row},${t.col}`)).length
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
