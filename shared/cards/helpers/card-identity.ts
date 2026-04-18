import { getMajorCardEffect } from '../major'
import { getRegisteredMinorImprovement } from '../types'

/**
 * Returns true if the card identified by `cardId` should be treated as a
 * major improvement for rules purposes. This covers:
 * - Cards registered in the major-card-effect pool (Fireplace, CookingHearth, etc.)
 * - MinorImprovement cards flagged `isMajorImprovement: true` (A60, D59, C60, D25)
 */
export const isEffectivelyMajor = (cardId: string): boolean => {
  if (getMajorCardEffect(cardId)) return true
  const minor = getRegisteredMinorImprovement(cardId)
  return !!minor?.isMajorImprovement
}
