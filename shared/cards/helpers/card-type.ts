import type { PlayerState } from '../../game/types'
import {
  getRegisteredMinorImprovement,
  getRegisteredOccupation,
  type CardType,
} from '../types'

/**
 * Dual-type card helpers — mirror of BGA's PlayerCard::hasType($type) and
 * getOtherCardTypes() (see bga-agricola/modules/php/Models/PlayerCard.php).
 *
 * A card "counts as" a type when its primary type matches OR when its
 * `alsoCountsAs?: CardType[]` list includes that type. Today the only
 * dual-type cards are D60_LargePottery / D59_EarthOven / A60_OrientalFireplace,
 * each a minor that also counts as a major for prereq / cookery / baking
 * accounting. Scoring intentionally does NOT call this helper — dual-type
 * minors stay in `player.minorPlayed` and earn their printed VP once.
 */

const getPrimaryType = (cardId: string): CardType | null => {
  if (cardId.startsWith('Major_')) return 'major'
  if (getRegisteredMinorImprovement(cardId)) return 'minor'
  if (getRegisteredOccupation(cardId)) return 'occupation'
  return null
}

const getAlsoCountsAs = (cardId: string): CardType[] | undefined =>
  getRegisteredMinorImprovement(cardId)?.alsoCountsAs
  ?? getRegisteredOccupation(cardId)?.alsoCountsAs

export const cardCountsAs = (cardId: string, asType: CardType): boolean => {
  if (getPrimaryType(cardId) === asType) return true
  return getAlsoCountsAs(cardId)?.includes(asType) ?? false
}

export const collectCardsAs = (
  player: PlayerState,
  asType: CardType,
): string[] => {
  const seen = new Set<string>()
  const all = [
    ...player.improvements,
    ...player.minorPlayed,
    ...player.occupationPlayed,
  ]
  for (const id of all) {
    if (cardCountsAs(id, asType)) seen.add(id)
  }
  return [...seen]
}
