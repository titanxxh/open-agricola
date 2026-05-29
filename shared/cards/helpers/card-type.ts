import type { PlayerState } from '../../contract/types'
import { getRegisteredMinorImprovement, getRegisteredOccupation } from '../../cards-display/types'
import type { CardDefinition, CardType } from '../../contract/cards'
import { getMajorCard } from '../major'

/**
 * Card-type helpers — mirror of BGA's PlayerCard::hasType($type) and
 * getOtherCardTypes() (see bga-agricola/modules/php/Models/PlayerCard.php).
 *
 * Primary type is derived from which catalog the card lives in (majors /
 * minors / occupations). A card additionally "counts as" extra types when its
 * `alsoCountsAs?: CardType[]` list includes that type — used by dual-type
 * cards (D60_LargePottery / D59_EarthOven / A60_OrientalFireplace /
 * D25_WitchesDanceFloor / C60_SmallPottersOven, all minors that also count as
 * major for prereq / cookery / baking accounting). Scoring intentionally does
 * NOT call `cardCountsAs` — dual-type minors stay in `player.minorPlayed` and
 * earn their printed VP once.
 *
 * `getCardPrimaryType` and the `is*CardId` helpers are the canonical "which
 * pool does this id live in" query — prefer them over `id.startsWith('Major_')`
 * etc. so card-id naming conventions stay an internal detail.
 */

export const getCardPrimaryType = (cardId: string): CardType | null => {
  if (getMajorCard(cardId)) return 'major'
  if (getRegisteredMinorImprovement(cardId)) return 'minor'
  if (getRegisteredOccupation(cardId)) return 'occupation'
  return null
}

export const isMajorCardId = (cardId: string): boolean =>
  getCardPrimaryType(cardId) === 'major'

export const isMinorCardId = (cardId: string): boolean =>
  getCardPrimaryType(cardId) === 'minor'

export const isOccupationCardId = (cardId: string): boolean =>
  getCardPrimaryType(cardId) === 'occupation'

const getAlsoCountsAs = (cardId: string): CardType[] | undefined =>
  getRegisteredMinorImprovement(cardId)?.alsoCountsAs
  ?? getRegisteredOccupation(cardId)?.alsoCountsAs

export const cardCountsAs = (cardId: string, asType: CardType): boolean => {
  if (getCardPrimaryType(cardId) === asType) return true
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

export type CardCapability =
  | 'preventsHandDiscard'
  | 'fireplaceIdentity'
  | 'cookingHearthIdentity'
  | 'ovenIdentity'
  | 'potteryIdentity'
  | 'animalHolder'
  | 'blocksHouseAnimalZones'

export type PlayedCardDefinitionOptions = {
  asType?: CardType
}

export const getCardDefinitionById = (cardId: string): CardDefinition | undefined =>
  getMajorCard(cardId)
  ?? getRegisteredMinorImprovement(cardId)
  ?? getRegisteredOccupation(cardId)

export const getPlayedCardDefinitions = (
  player: PlayerState,
  options: PlayedCardDefinitionOptions = {},
): CardDefinition[] => {
  const ids = options.asType
    ? collectCardsAs(player, options.asType)
    : [...new Set([
      ...player.improvements,
      ...player.minorPlayed,
      ...player.occupationPlayed,
    ])]
  return ids.flatMap((id) => {
    const def = getCardDefinitionById(id)
    return def ? [def] : []
  })
}

export const collectCardDefinitionsAs = (
  player: PlayerState,
  asType: CardType,
): CardDefinition[] =>
  getPlayedCardDefinitions(player, { asType })

export const playerHasCardCapability = (
  player: PlayerState,
  capability: CardCapability,
  options: PlayedCardDefinitionOptions = {},
): boolean =>
  getPlayedCardDefinitions(player, options).some((def) => def[capability] === true)

/**
 * `fireplaceIdentity` query — true for the Major Fireplace cards plus any
 * minor declaring the marker (e.g. D25_WitchesDanceFloor). Used by the
 * "return-a-Fireplace" cost slot machinery in payment / improvement so the
 * cost handler does not need to enumerate Major_Fireplace1 / Major_Fireplace2
 * explicitly.
 */
export const isFireplaceIdentityCard = (cardId: string): boolean => {
  if (getMajorCard(cardId)?.fireplaceIdentity) return true
  if (getRegisteredMinorImprovement(cardId)?.fireplaceIdentity) return true
  return false
}

/**
 * `enablesPalisades` query rolled up to a player — true iff any of the
 * player's played cards declares the marker that unlocks placing wooden
 * palisades on fence edges. Currently only B30_WoodPalisades carries it,
 * but main-path code must query the marker, not the card id, so future
 * cards with the same ability slot in without further changes.
 */
export const playerCanBuildPalisades = (player: PlayerState): boolean => {
  const has = (id: string): boolean =>
    !!getRegisteredMinorImprovement(id)?.enablesPalisades
    || !!getRegisteredOccupation(id)?.enablesPalisades
    || !!getMajorCard(id)?.enablesPalisades
  return (
    player.minorPlayed.some(has)
    || player.occupationPlayed.some(has)
    || player.improvements.some(has)
  )
}
