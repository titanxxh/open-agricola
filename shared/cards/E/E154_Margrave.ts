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
  desc: ['Once you live in a stone house, you get 2 <FOOD> each time any player renovates and, during scoring, 1 bonus <SCORE> for each wood house and clay house.'],
  cost: {},
  players: "3+",
})
