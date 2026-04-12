import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C59_SchnappsDistillery'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    const veg = player.resources.vegetable + player.fields.filter((f) => f.crop === 'vegetable').reduce((sum, f) => sum + f.remaining, 0)
    if (veg >= 6) return 2
    if (veg >= 5) return 1
    return 0
  },
})

export const C59_SchnappsDistillery = new MinorImprovement({
  id: CARD_ID,
  name: "Schnapps Distillery",
  deck: "C",
  number: 59,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1/2 bonus <SCORE> for exactly 5/6+ vegetables (in supply and on fields)."],
  cost: { wood: 2, clay: 1 },
})
