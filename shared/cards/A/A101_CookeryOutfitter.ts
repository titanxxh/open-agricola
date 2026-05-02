import { Occupation } from '../types'
import { getPlayerCookeryCards } from '../helpers/cookery'
import type { CardImpl } from '../registry'

const CARD_ID = 'A101_CookeryOutfitter'

export const A101_CookeryOutfitter = new Occupation({
  id: CARD_ID,
  name: "Cookery Outfitter",
  deck: "A",
  number: 101,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each cooking improvement you have. (Ovens are not considered cooking improvements.)"],
  cost: {},
  players: "1+",
  extraVp: true,
})

export const A101_CookeryOutfitter_impl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) => {
      const improvements = player.improvements ?? []
      return getPlayerCookeryCards(player).filter((c) => improvements.includes(c.id)).length
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
