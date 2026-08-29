import type { PlayerState } from '../../contract/types'
import { getStableCountForCards } from '../../domain/stables'
import { getFenceCount } from '../../domain/fence-segments'
import { ensureCardState } from './card-state'

const ACTION_SNAPSHOT_CARD_ID = '__actionSnapshot__'

const lastActionToken = (player: PlayerState): number => {
  const extraData = player.cardStates?.[ACTION_SNAPSHOT_CARD_ID]?.extraData
  const value = extraData?.lastToken ?? extraData?.token
  return typeof value === 'number' ? value : 0
}

export const recordActionSnapshot = (
  player: PlayerState,
  token: number,
) => {
  const cardState = ensureCardState(player, ACTION_SNAPSHOT_CARD_ID)
  const nextToken = Math.max(token, lastActionToken(player) + 1)
  cardState.extraData = {
    lastToken: nextToken,
    token: nextToken,
    stableTiles: getStableCountForCards(player),
    roomTiles: player.roomTiles.length,
    fenceSegments: getFenceCount(player),
  }
  return nextToken
}

export const beginTurnScope = (player: PlayerState): number =>
  recordActionSnapshot(player, 1)

export const endTurnScope = (player: PlayerState): void => {
  const cardState = player.cardStates?.[ACTION_SNAPSHOT_CARD_ID]
  if (!cardState) return
  const lastToken = lastActionToken(player)
  cardState.extraData = lastToken > 0 ? { lastToken } : {}
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
  return Math.max(0, getFenceCount(player) - before)
}
