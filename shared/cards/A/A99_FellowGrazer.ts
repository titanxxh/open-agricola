import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'A99_FellowGrazer'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    return player.pastures.filter((p) => p.size >= 3).length * 2
  },
})

export const A99_FellowGrazer = new Occupation({
  id: CARD_ID,
  name: "Fellow Grazer",
  deck: "A",
  number: 99,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 2 bonus <SCORE> for each pasture with 3 or more spaces."],
  cost: {},
  players: "1+",
})
