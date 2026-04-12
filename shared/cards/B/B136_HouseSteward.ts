import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'B136_HouseSteward'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    const maxRooms = Math.max(...state.players.map((p) => p.rooms))
    const winners = state.players.filter((p) => p.rooms === maxRooms)
    return winners.some((p) => p.id === player.id) ? 3 : 0
  },
})

export const B136_HouseSteward = new Occupation({
  id: CARD_ID,
  name: "House Steward",
  deck: "B",
  number: 136,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 3 bonus <SCORE> if you have the most rooms (shared)."],
  cost: {},
  players: "1+",
})
