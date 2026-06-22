import type { PlayerState } from '../../contract/types'
import { getStableCountForCards } from '../../domain/stables'
import { ensureCardState } from './card-state'

const ACTION_SNAPSHOT_CARD_ID = '__actionSnapshot__'

export const recordActionSnapshot = (
  player: PlayerState,
  token: number,
) => {
  const cardState = ensureCardState(player, ACTION_SNAPSHOT_CARD_ID)
  cardState.extraData = {
    token,
    stableTiles: getStableCountForCards(player),
    roomTiles: player.roomTiles.length,
    fenceSegments: player.fenceSegments.length,
  }
}

export const readActionSnapshotToken = (player: PlayerState): number | undefined =>
  player.cardStates?.[ACTION_SNAPSHOT_CARD_ID]?.extraData?.token as number | undefined

export const readActionSnapshotExtraData = <T>(
  player: PlayerState,
  key: string,
): T | undefined =>
  player.cardStates?.[ACTION_SNAPSHOT_CARD_ID]?.extraData?.[key] as T | undefined

export const writeActionSnapshotExtraData = (
  player: PlayerState,
  key: string,
  value: unknown,
) => {
  const cardState = ensureCardState(player, ACTION_SNAPSHOT_CARD_ID)
  cardState.extraData = {
    ...(cardState.extraData ?? {}),
    [key]: value,
  }
}

export const getStableTilesBuiltThisAction = (player: PlayerState) => {
  const before =
    player.cardStates?.[ACTION_SNAPSHOT_CARD_ID]?.extraData?.stableTiles as number | undefined
  if (typeof before !== 'number') return 0
  return Math.max(0, getStableCountForCards(player) - before)
}

export const getRoomsBuiltThisAction = (player: PlayerState) => {
  const before =
    player.cardStates?.[ACTION_SNAPSHOT_CARD_ID]?.extraData?.roomTiles as number | undefined
  if (typeof before !== 'number') return 0
  return Math.max(0, player.roomTiles.length - before)
}

export const getFencesBuiltThisAction = (player: PlayerState) => {
  const before =
    player.cardStates?.[ACTION_SNAPSHOT_CARD_ID]?.extraData?.fenceSegments as number | undefined
  if (typeof before !== 'number') return 0
  return Math.max(0, player.fenceSegments.length - before)
}
