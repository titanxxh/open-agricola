import { getRegisteredMinorImprovement } from '../types'

/**
 * Returns true if the card identified by `cardId` should be treated as a
 * major improvement for rules purposes. This covers:
 * - Cards in the major pool (id prefix `Major_`: Fireplace, CookingHearth, etc.)
 * - MinorImprovement cards flagged `isMajorImprovement: true` (A60, D59, C60, D25)
 */
export const isEffectivelyMajor = (cardId: string): boolean => {
  if (cardId.startsWith('Major_')) return true
  const minor = getRegisteredMinorImprovement(cardId)
  return !!minor?.isMajorImprovement
}
