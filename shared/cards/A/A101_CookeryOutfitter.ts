import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'A101_CookeryOutfitter'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    const cookingIds = ['Major_Fireplace1', 'Major_Fireplace2', 'Major_CookingHearth1', 'Major_CookingHearth2']
    return player.improvements.filter((id) => cookingIds.includes(id)).length
  },
})

export const A101_CookeryOutfitter = new Occupation({
  id: CARD_ID,
  name: "Cookery Outfitter",
  deck: "A",
  number: 101,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each cooking improvement (Fireplace, Cooking Hearth)."],
  cost: {},
  players: "1+",
})
