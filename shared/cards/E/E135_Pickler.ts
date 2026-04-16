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
  desc: ['If there are still 1/3/6/9 complete rounds left to play, you immediately get 1/2/3/4 <WOOD>. During scoring, each player with the most total <VEGETABLE> gets 3 bonus <SCORE>.'],
  cost: {},
  players: "3+",
})
