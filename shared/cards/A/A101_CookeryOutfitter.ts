import { Occupation, getRegisteredMinorImprovement } from '../types'
import { getMajorCardEffect } from '../major'
import { collectCardsAs } from '../helpers/card-type'
import type { CardImpl } from '../registry'

const CARD_ID = 'A101_CookeryOutfitter'

const isCookeryCard = (cardId: string): boolean => {
  const major = getMajorCardEffect(cardId)
  if (major?.isCookery) return true
  const minor = getRegisteredMinorImprovement(cardId)
  return !!minor?.isCookery
}

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

export const A101_CookeryOutfitter_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return collectCardsAs(player, 'major').filter(isCookeryCard).length
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
