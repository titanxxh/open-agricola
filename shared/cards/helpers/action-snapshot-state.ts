import type { PlayerState } from '../../contract/types'

export const ACTION_SNAPSHOT_CARD_ID = '__actionSnapshot__'

export const readActionSnapshotExtraData = <T>(
  player: PlayerState,
  key: string,
): T | undefined =>
  player.cardStates?.[ACTION_SNAPSHOT_CARD_ID]?.extraData?.[key] as T | undefined
