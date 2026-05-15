import type { FarmTilePosition } from '../../shared/contract/types'
import { parsePositionKey, positionKey } from '../../shared/domain/farm'

export type WsStatus =
  | { phase: 'idle' }
  | { phase: 'connecting' }
  | { phase: 'creating' }
  | { phase: 'joining'; roomId: string }
  | { phase: 'waiting'; roomId: string; players: Array<{ playerIndex: number; name: string }>; maxPlayers: number }
  | { phase: 'ready'; roomId: string; playerIndex: number }
  | { phase: 'error'; message: string }

export const playerIdFromWsStatus = (status: WsStatus): string | null =>
  status.phase === 'ready' ? `p${status.playerIndex + 1}` : null

export type FarmCommitType = 'fence' | 'room' | 'stable' | 'plow' | 'sow'

const farmErrorKeys = {
  room: {
    NO_SELECTION: 'ui.roomErrorNoSelection',
    INVALID_POSITION: 'ui.roomErrorInvalid',
    OCCUPIED: 'ui.roomErrorOccupied',
    NOT_CONNECTED: 'ui.roomErrorNotConnected',
    LOCKED: 'ui.roomErrorInvalid',
    'unable to pay room cost': 'ui.roomErrorNoResources',
    'too many rooms selected': 'ui.roomErrorInvalid',
  },
  stable: {
    NO_SELECTION: 'ui.stableErrorNoSelection',
    INVALID_POSITION: 'ui.stableErrorInvalid',
    OCCUPIED: 'ui.stableErrorOccupied',
    LOCKED: 'ui.stableErrorInvalid',
    LIMIT_REACHED: 'ui.stableErrorLimit',
    'unable to pay stable cost': 'ui.stableErrorNoResources',
  },
  plow: {
    NO_SELECTION: 'ui.plowErrorNoSelection',
    INVALID_POSITION: 'ui.plowErrorInvalid',
    OCCUPIED: 'ui.plowErrorOccupied',
    NOT_ADJACENT: 'ui.plowErrorNotAdjacent',
    FENCED: 'ui.plowErrorFenced',
    LOCKED: 'ui.plowErrorInvalid',
    'unable to pay plow cost': 'ui.plowErrorUnknown',
  },
  sow: {
    NO_SELECTION: 'ui.sowErrorNoSelection',
    INVALID_POSITION: 'ui.sowErrorInvalid',
    NOT_EMPTY: 'ui.sowErrorNotEmpty',
    NO_SEEDS: 'ui.sowErrorNoSeeds',
    INVALID_CROP: 'ui.sowErrorInvalidCrop',
  },
} as const

export const farmCommitErrorMessageKey = (
  farmType: FarmCommitType,
  error?: string,
): string => {
  if (farmType === 'fence') return error ? `fence.error.${error}` : 'fence.error.UNKNOWN'
  const typeMap = farmErrorKeys[farmType]
  return (error && error in typeMap)
    ? typeMap[error as keyof typeof typeMap]
    : `ui.${farmType}ErrorUnknown`
}

const roomNeighborKeys = (key: string) => {
  const tile = parsePositionKey(key)
  if (!tile) return []
  return [
    `${tile.row - 1}-${tile.col}`,
    `${tile.row + 1}-${tile.col}`,
    `${tile.row}-${tile.col - 1}`,
    `${tile.row}-${tile.col + 1}`,
  ]
}

export const getCurrentlySelectableRoomKeys = (
  baseTiles: FarmTilePosition[],
  existingRoomKeys: Set<string>,
  pendingRoomKeys: Set<string>,
): Set<string> => {
  const anchors = new Set([...existingRoomKeys, ...pendingRoomKeys])
  return new Set(
    baseTiles
      .map((tile) => positionKey(tile))
      .filter((key) => pendingRoomKeys.has(key) || roomNeighborKeys(key).some((neighbor) => anchors.has(neighbor))),
  )
}

const FIXED_DEV_ROOM_IDS = new Set(['dev2', 'dev3', 'dev4'])

export const isDevModeAllowedFromQuery = (search: string): boolean => {
  const params = new URLSearchParams(search)
  if (params.get('devMode') !== '1') return false
  const roomId = params.get('room')
  if (roomId && FIXED_DEV_ROOM_IDS.has(roomId)) return true
  return params.get('embedded') === '1' && params.get('transport') !== 'ws'
}
