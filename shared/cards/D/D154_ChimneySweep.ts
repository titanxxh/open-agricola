import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D154_ChimneySweep'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    return state.players.filter((p) => p.id !== player.id && p.houseType === 'stone').length
  },
})

export const D154_ChimneySweep = new Occupation({
  id: CARD_ID,
  name: "Chimney Sweep",
  deck: "D",
  number: 154,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each other player who has a stone house."],
  cost: {},
  players: "3+",
})
