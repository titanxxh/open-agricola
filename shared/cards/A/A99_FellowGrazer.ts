import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'A99_FellowGrazer'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return player.pastures.filter((p) => p.size >= 3).length * 2
  },
})

export const A99_FellowGrazer = new Occupation({
  id: CARD_ID,
  name: "Fellow Grazer",
  deck: "A",
  number: 99,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 2 bonus <SCORE> for each pasture you have covering at least 3 farmyard spaces."],
  cost: {},
  players: "1+",
})
