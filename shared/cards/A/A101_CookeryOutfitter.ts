import { Occupation, getRegisteredMinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { getMajorCardEffect } from '../major'
import { collectCardsAs } from '../helpers/card-type'

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
    return collectCardsAs(player, 'major').filter(isCookeryCard).length
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
