import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E135_Pickler'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    const totalVeg = (p: typeof player) =>
      (p.resources.vegetable ?? 0) + p.fields.filter((f) => f.crop === 'vegetable').reduce((sum, f) => sum + (f.remaining ?? 0), 0)
    const myVeg = totalVeg(player)
    const maxVeg = Math.max(...state.players.map(totalVeg))
    return myVeg === maxVeg && myVeg > 0 ? 3 : 0
  },
})

export const E135_Pickler = new Occupation({
  id: CARD_ID,
  name: "Pickler",
  deck: "E",
  number: 135,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 3 bonus <SCORE> if you have the most total vegetables (supply + fields, shared)."],
  cost: {},
  players: "3+",
})
