import type { FarmTilePosition, PlayerState } from '../contract/types'
import { getLooseStableKeys } from './animal-zones'

const FARM_HAND_CARD_ID = 'B085_FarmHand'
const FARM_HAND_POSITION_KEY = 'position'

export const getFarmHandStablePosition = (
  player: PlayerState,
): FarmTilePosition | undefined => {
  const raw = player.cardStates?.[FARM_HAND_CARD_ID]?.extraData?.[FARM_HAND_POSITION_KEY]
  if (!raw || typeof raw !== 'object') return undefined
  const candidate = raw as { row?: unknown; col?: unknown }
  return typeof candidate.row === 'number' && typeof candidate.col === 'number'
    ? { row: candidate.row, col: candidate.col }
    : undefined
}

export const clearFarmHandStablePosition = (player: PlayerState): void => {
  const extraData = player.cardStates?.[FARM_HAND_CARD_ID]?.extraData
  if (extraData) delete extraData[FARM_HAND_POSITION_KEY]
}

export const getFarmHandStableInUseCount = (player: PlayerState): number =>
  getFarmHandStablePosition(player) ? 1 : 0

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
