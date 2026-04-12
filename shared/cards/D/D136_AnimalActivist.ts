import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D136_AnimalActivist'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    const fencedStables = (p: typeof player) =>
      p.pastures.reduce((sum, past) => sum + past.stables, 0)
    const myCount = fencedStables(player)
    const maxCount = Math.max(...state.players.map(fencedStables))
    return myCount === maxCount && myCount > 0 ? 2 : 0
  },
})

export const D136_AnimalActivist = new Occupation({
  id: CARD_ID,
  name: "Animal Activist",
  deck: "D",
  number: 136,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 2 bonus <SCORE> if you have the most fenced stables (shared)."],
  cost: {},
  players: "3+",
})
