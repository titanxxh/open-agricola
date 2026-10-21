import type { PlayerState } from '../contract/types'
import { getLooseStableKeys } from './animal-zones'
import { collectBuiltSpecialStables } from '../cards/card-effects'
import { getOrdinaryStableCount } from './stable-pieces'
export { getOrdinaryStableCount } from './stable-pieces'

export const getStandingSpecialStableCount = (player: PlayerState): number =>
  collectBuiltSpecialStables(player).length

export const getStableCountForCards = (player: PlayerState): number =>
  getOrdinaryStableCount(player) + getStandingSpecialStableCount(player)

export const getUnfencedStableCountForCards = (player: PlayerState): number =>
  getLooseStableKeys(player).length + getStandingSpecialStableCount(player)

export const getEmptyUnfencedStableCountForCards = (player: PlayerState): number => {
  const emptyOrdinary = getLooseStableKeys(player).filter(
    (key) => (player.stableAnimals?.[key]?.animalCount ?? 0) === 0,
  ).length
  return emptyOrdinary + getStandingSpecialStableCount(player)
}
