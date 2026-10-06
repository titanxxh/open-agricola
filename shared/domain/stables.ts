import type { PlayerState } from '../contract/types'
import { getLooseStableKeys } from './animal-zones'
import { collectBuiltSpecialStables } from '../cards/card-effects'

export const getStandingSpecialStableCount = (player: PlayerState): number =>
  collectBuiltSpecialStables(player).length

export const getOrdinaryStableCount = (player: PlayerState): number =>
  player.stableTiles.length

export const getStableCountForCards = (player: PlayerState): number =>
  getOrdinaryStableCount(player) + getStandingSpecialStableCount(player)

export const getUnfencedStableCountForCards = (player: PlayerState): number =>
  getLooseStableKeys(player).length + getStandingSpecialStableCount(player)

export const getEmptyUnfencedStableCountForCards = (player: PlayerState): number => {
  const emptyOrdinary = getLooseStableKeys(player).filter(
    (key) => !player.stableAnimals?.[key],
  ).length
  return emptyOrdinary + getStandingSpecialStableCount(player)
}
