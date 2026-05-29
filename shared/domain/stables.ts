import type { PlayerState } from '../contract/types'
import { getLooseStableKeys } from './animal-zones'

export const getFarmHandStableInUseCount = (player: PlayerState): number =>
  player.cardStates?.B85_FarmHand?.extraData?.position ? 1 : 0

export const getOrdinaryStableCount = (player: PlayerState): number =>
  player.stableTiles.length

export const getStableCountForCards = (player: PlayerState): number =>
  getOrdinaryStableCount(player) + getFarmHandStableInUseCount(player)

export const getUnfencedStableCountForCards = (player: PlayerState): number =>
  getLooseStableKeys(player).length + getFarmHandStableInUseCount(player)

export const getEmptyUnfencedStableCountForCards = (player: PlayerState): number => {
  const emptyOrdinary = getLooseStableKeys(player).filter(
    (key) => !player.stableAnimals?.[key],
  ).length
  return emptyOrdinary + getFarmHandStableInUseCount(player)
}
