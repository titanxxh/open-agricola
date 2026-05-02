import type { PlayerState } from '../../game/types'
import type { CardExchange } from '../types'
import { getRegisteredMinorImprovement } from '../types'
import { getMajorCard } from '../major'

export type CookeryCardSummary = {
  id: string
  exchanges?: readonly CardExchange[]
}

/**
 * Returns the list of `isCookery` cards the player has in play, both major
 * and minor. Used by C62 CookeryExtension's listener to derive doubled-food
 * harvest trades, and by A101 CookeryOutfitter's score helper.
 *
 * Order: improvements (majors) first, minors second. Stable per-call.
 */
export const getPlayerCookeryCards = (player: PlayerState): CookeryCardSummary[] => {
  const out: CookeryCardSummary[] = []
  for (const cardId of player.improvements ?? []) {
    const major = getMajorCard(cardId)
    if (major?.isCookery) out.push({ id: cardId, exchanges: major.exchanges })
  }
  for (const cardId of player.minorPlayed ?? []) {
    const minor = getRegisteredMinorImprovement(cardId)
    if (minor?.isCookery) out.push({ id: cardId, exchanges: minor.exchanges })
  }
  return out
}
