import { resourceKeyList } from '../../shared/contract/state-constants'
import type { FarmTilePosition, Resource } from '../../shared/contract/types'
import type { GameSyncPayload } from '../../shared/contract/protocol/game'
import { parsePositionKey, positionKey } from '../../shared/domain/farm'
import type { Locale } from '../../shared/i18n'
import type {
  PublicEventFenceEdgeHighlightTarget,
  PublicEventFarmTileHighlightTarget,
  PublicEventHighlightTargets,
  PublicEventNotification,
  PublicEventResourceAnimation,
} from './public-event-notifications'
import {
  collectPublicEventHighlightTargets,
  collectPublicEventNotifications,
  collectPublicEventResourceAnimations,
  emptyPublicEventHighlightTargets,
  maxPublicEventSeq,
} from './public-event-notifications'
import type { ReplayTimelineEntry } from './replay-timeline'
import { replayTimelineNamespaceId } from './replay-timeline'
import type { WsStatus } from './ws-status'

export type { WsStatus } from './ws-status'

export const playerIdFromWsStatus = (status: WsStatus): string | null =>
  status.phase === 'ready' ? `p${status.playerIndex + 1}` : null

type PublicEventCancellationSnapshotPayload = {
  publicEventCancellations?: GameSyncPayload['publicEventCancellations']
  state: { events?: readonly { seq: number }[] }
}

type PublicEventCancellationSnapshotHandlers = {
  clearPublicEventFeedback: () => void
  setLastSeenPublicEventSeq: (seq: number) => void
}

export const applyPublicEventCancellationSnapshot = (
  payload: PublicEventCancellationSnapshotPayload,
  handlers: PublicEventCancellationSnapshotHandlers,
): boolean => {
  if (!payload.publicEventCancellations?.length) return false
  handlers.clearPublicEventFeedback()
  handlers.setLastSeenPublicEventSeq(maxPublicEventSeq(payload.state.events))
  return true
}

export type ReplayFeedback = {
  notifications: PublicEventNotification[]
  highlights: PublicEventHighlightTargets
  resourceAnimations: PublicEventResourceAnimation[]
}

export const clearReplayFeedback = (): ReplayFeedback => ({
  notifications: [],
  highlights: emptyPublicEventHighlightTargets(),
  resourceAnimations: [],
})

export const buildReplayFeedback = (
  entry: ReplayTimelineEntry | null,
  locale: Locale,
): ReplayFeedback => {
  if (!entry?.event || !entry.replayable || entry.kind !== 'event') return clearReplayFeedback()
  const idPrefix = `replay:${entry.key}`
  return {
    notifications: collectPublicEventNotifications([entry.event], locale, idPrefix),
    highlights: collectPublicEventHighlightTargets([entry.event]),
    resourceAnimations: collectPublicEventResourceAnimations([entry.event]).map((animation) => ({
      ...animation,
      id: replayTimelineNamespaceId(entry, animation.id),
    })),
  }
}

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

export const hasPublicEventHighlights = (targets: PublicEventHighlightTargets): boolean =>
  targets.actionIds.length > 0 || targets.farmTiles.length > 0 || targets.fenceEdges.length > 0

export const mergePublicEventHighlights = (
  current: PublicEventHighlightTargets,
  incoming: PublicEventHighlightTargets,
): PublicEventHighlightTargets => ({
  actionIds: [...incoming.actionIds, ...current.actionIds],
  farmTiles: [...incoming.farmTiles, ...current.farmTiles],
  fenceEdges: [...incoming.fenceEdges, ...current.fenceEdges],
})

export const mergePublicEventResourceAnimations = (
  current: readonly PublicEventResourceAnimation[],
  incoming: readonly PublicEventResourceAnimation[],
): PublicEventResourceAnimation[] => [...incoming, ...current]

const removeCountedItems = <T>(
  current: readonly T[],
  removing: readonly T[],
  keyOf: (value: T) => string,
): T[] => {
  const remaining = new Map<string, number>()
  removing.forEach((value) => {
    const key = keyOf(value)
    remaining.set(key, (remaining.get(key) ?? 0) + 1)
  })
  return current.filter((value) => {
    const key = keyOf(value)
    const count = remaining.get(key) ?? 0
    if (count <= 0) return true
    remaining.set(key, count - 1)
    return false
  })
}

const farmTileHighlightKey = (target: PublicEventFarmTileHighlightTarget): string =>
  `${target.playerId}:${target.key}`

const fenceEdgeHighlightKey = (target: PublicEventFenceEdgeHighlightTarget): string =>
  `${target.playerId}:${target.edgeId}`

const resourceAnimationResourcesKey = (resources: Partial<Resource>): string =>
  resourceKeyList
    .map((key) => `${key}:${resources[key] ?? 0}`)
    .join('|')

const resourceAnimationKey = (animation: PublicEventResourceAnimation): string =>
  `${animation.id}:${animation.kind}:${JSON.stringify(animation.from)}:${JSON.stringify(animation.to)}:${resourceAnimationResourcesKey(animation.resources)}`

export const removePublicEventHighlights = (
  current: PublicEventHighlightTargets,
  removing: PublicEventHighlightTargets,
): PublicEventHighlightTargets => ({
  actionIds: removeCountedItems(current.actionIds, removing.actionIds, (value) => value),
  farmTiles: removeCountedItems(current.farmTiles, removing.farmTiles, farmTileHighlightKey),
  fenceEdges: removeCountedItems(current.fenceEdges, removing.fenceEdges, fenceEdgeHighlightKey),
})

export const removePublicEventResourceAnimations = (
  current: readonly PublicEventResourceAnimation[],
  removing: readonly PublicEventResourceAnimation[],
): PublicEventResourceAnimation[] =>
  removeCountedItems(current, removing, resourceAnimationKey)

export const filterPublicFarmHighlightsForPlayer = (
  targets: readonly PublicEventFarmTileHighlightTarget[],
  playerId: string,
): Set<string> =>
  new Set(targets.filter((target) => target.playerId === playerId).map((target) => target.key))

export const filterPublicFenceHighlightsForPlayer = (
  targets: readonly PublicEventFenceEdgeHighlightTarget[],
  playerId: string,
): Set<string> =>
  new Set(targets.filter((target) => target.playerId === playerId).map((target) => target.edgeId))

const FIXED_DEV_ROOM_IDS = new Set(['dev2', 'dev3', 'dev4'])

export const isDevModeAllowedFromQuery = (search: string): boolean => {
  const params = new URLSearchParams(search)
  if (params.get('devMode') !== '1') return false
  const roomId = params.get('room')
  if (roomId && FIXED_DEV_ROOM_IDS.has(roomId)) return true
  return params.get('embedded') === '1' && params.get('transport') !== 'ws'
}
