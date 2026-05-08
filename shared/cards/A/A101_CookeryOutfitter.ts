import { getPlayerCookeryCards } from '../helpers/cookery'
import type { CardImpl } from '../registry'
import { A101_CookeryOutfitter } from '../../cards-display/A/A101_CookeryOutfitter'
export { A101_CookeryOutfitter }

const CARD_ID = A101_CookeryOutfitter.id

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
