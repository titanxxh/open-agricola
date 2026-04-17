import { Occupation, getRegisteredMinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { getMajorCardEffect } from '../major'

const CARD_ID = 'A101_CookeryOutfitter'

const isCookeryCard = (cardId: string): boolean => {
  const major = getMajorCardEffect(cardId)
  if (major?.isCookery) return true
  const minor = getRegisteredMinorImprovement(cardId)
  return !!minor?.isCookery
}

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    const cookingMajors = player.improvements.filter(isCookeryCard)
    const cookingMinors = player.minorPlayed.filter(isCookeryCard)
    return cookingMajors.length + cookingMinors.length
  },
})

export const A101_CookeryOutfitter = new Occupation({
  id: CARD_ID,
  name: "Cookery Outfitter",
  deck: "A",
  number: 101,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each cooking improvement you have. (Ovens are not considered cooking improvements.)"],
  cost: {},
  players: "1+",
})
