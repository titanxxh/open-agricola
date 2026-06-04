import { defineOccupationCard } from '../card-source'
import { getPlayerCookeryCards } from '../helpers/cookery'
import type { CardImpl } from '../registry'

const CARD_ID = 'A101_CookeryOutfitter'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) => {
      const improvements = player.improvements ?? []
      return getPlayerCookeryCards(player).filter((c) => improvements.includes(c.id)).length
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A101_CookeryOutfitter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Cookery Outfitter",
    deck: "A",
    number: 101,
    category: "POINTS_PROVIDER",
    desc: ["During scoring, you get 1 bonus <SCORE> for each cooking improvement you have. (Ovens are not considered cooking improvements.)"],
    cost: {},
    players: "1+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const A101_CookeryOutfitter_impl = A101_CookeryOutfitter.impl
