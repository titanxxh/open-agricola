import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E34_LandRegister'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    const usedTiles = new Set<string>()
    player.roomTiles.forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    player.fields.forEach((f) => usedTiles.add(`${f.row},${f.col}`))
    player.stableTiles.forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    player.pastures.flatMap((p) => p.tiles).forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    return usedTiles.size >= 15 ? 2 : 0
  },
})

export const E34_LandRegister = new MinorImprovement({
  id: CARD_ID,
  name: "Land Register",
  deck: "E",
  number: 34,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 2 bonus <SCORE> if your farm has no unused spaces."],
  cost: {},
  vp: 0,
})
