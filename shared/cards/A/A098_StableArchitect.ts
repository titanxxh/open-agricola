import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'A098_StableArchitect'

const cardImpl = {
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

export const A098_StableArchitect = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Stable Architect",
    deck: "A",
    number: 98,
    category: "POINTS_PROVIDER",
    desc: ["During scoring, you get 1 bonus <SCORE> for each unfenced stable in your farmyard."],
    cost: {},
    players: "1+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const A098_StableArchitect_impl = A098_StableArchitect.impl
