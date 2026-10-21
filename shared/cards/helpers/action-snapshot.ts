import type { PlayerState } from '../../contract/types'
import { ensureCardState } from './card-state'

import { ACTION_SNAPSHOT_CARD_ID } from './action-snapshot-state'
export { readActionSnapshotExtraData } from './action-snapshot-state'

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
  }
  player.turnConstruction = { stablePieces: [], fenceBuilt: false }
  return nextToken
}

export const beginTurnScope = (player: PlayerState): number =>
  recordActionSnapshot(player, 1)

export const endTurnScope = (player: PlayerState): void => {
  delete player.turnConstruction
  const cardState = player.cardStates?.[ACTION_SNAPSHOT_CARD_ID]
  if (!cardState) return
  const lastToken = lastActionToken(player)
  cardState.extraData = lastToken > 0 ? { lastToken } : {}
}

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

export const countDistinctStablesBuiltThisTurn = (player: PlayerState): number => player.turnConstruction?.stablePieces.length ?? 0
export const hasBuiltStableThisTurn = (player: PlayerState): boolean => countDistinctStablesBuiltThisTurn(player) > 0
export const roomTypeBuiltThisTurn = (player: PlayerState): PlayerState['houseType'] | undefined => player.turnConstruction?.roomType
export const hasBuiltFenceThisTurn = (player: PlayerState): boolean => player.turnConstruction?.fenceBuilt ?? false
