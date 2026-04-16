import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D135_GardeningHeadOfficial'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    const vegInFields = (p: typeof player) =>
      p.fields.filter((f) => f.crop === 'vegetable').reduce((sum, f) => sum + (f.remaining ?? 0), 0)
    const myVeg = vegInFields(player)
    const maxVeg = Math.max(...state.players.map(vegInFields))
    return myVeg === maxVeg && myVeg > 0 ? 2 : 0
  },
})

export const D135_GardeningHeadOfficial = new Occupation({
  id: CARD_ID,
  name: "Gardening Head Official",
  deck: "D",
  number: 135,
  category: "POINTS_PROVIDER",
  desc: [
    'If there are still 3/6/9 complete rounds left to play, you immediately get 2/3/4 <WOOD>. During scoring, each player with the most vegetables in their fields gets 2 bonus <SCORE>.',
  ],
  cost: {},
  players: "3+",
})
