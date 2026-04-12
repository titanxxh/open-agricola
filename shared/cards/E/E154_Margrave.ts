import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E154_Margrave'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    if (player.houseType !== 'stone') return 0
    return state.players.filter((p) => p.id !== player.id && p.houseType !== 'stone').length
  },
})

export const E154_Margrave = new Occupation({
  id: CARD_ID,
  name: "Margrave",
  deck: "E",
  number: 154,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, if you have a stone house, you get 1 bonus <SCORE> per opponent with a wood or clay house."],
  cost: {},
  players: "3+",
})
