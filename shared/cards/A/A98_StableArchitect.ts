import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A98_StableArchitect'

export const A98_StableArchitect = new Occupation({
  id: CARD_ID,
  name: "Stable Architect",
  deck: "A",
  number: 98,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each unfenced stable in your farmyard."],
  cost: {},
  players: "1+",
})

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
