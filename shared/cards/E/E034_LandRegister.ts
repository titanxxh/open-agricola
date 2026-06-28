import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E034_LandRegister'

const cardImpl = {
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

export const E034_LandRegister = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Land Register",
    deck: "E",
    number: 34,
    category: "BONUS_POINTS_-_GET",
    desc: ['During scoring, if your farm has no unused spaces, you get 2 bonus <SCORE>.'],
    cost: { wood: 1 },
    vp: 0,
    extraVp: true,
  },
  impl: cardImpl,
})

export const E034_LandRegister_impl = E034_LandRegister.impl
