import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'A98_StableArchitect'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const pastureStableTiles = new Set(
      player.pastures.flatMap((p) => p.tiles.map((t) => `${t.row},${t.col}`))
    )
    return player.stableTiles.filter((t) => !pastureStableTiles.has(`${t.row},${t.col}`)).length
  },
})

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
