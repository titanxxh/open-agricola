import type { PlayerState } from '../../game/types'
import { ensureCardState } from './card-state'

const ACTION_SNAPSHOT_CARD_ID = '__actionSnapshot__'

export const recordActionSnapshot = (
  player: PlayerState,
  token: number,
) => {
  const cardState = ensureCardState(player, ACTION_SNAPSHOT_CARD_ID)
  cardState.extraData = {
    token,
    stableTiles: player.stableTiles.length,
    roomTiles: player.roomTiles.length,
    fenceSegments: player.fenceSegments.length,
  }
}

export const readActionSnapshotToken = (player: PlayerState): number | undefined =>
  player.cardStates?.[ACTION_SNAPSHOT_CARD_ID]?.extraData?.token as number | undefined

export const getStableTilesBuiltThisAction = (player: PlayerState) => {
  const before =
    player.cardStates?.[ACTION_SNAPSHOT_CARD_ID]?.extraData?.stableTiles as number | undefined
  if (typeof before !== 'number') return 0
  return Math.max(0, player.stableTiles.length - before)
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
