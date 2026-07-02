import { extendedResourceKeyList, resourceKeyList } from '../../shared/contract/state-constants'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../shared/actions/helpers/placement-constants'
import { seasonActionIds } from '../../shared/seasons/action-spaces'
import type { ActionChoiceOption, ActionSpace, FarmTilePosition, GameState, PlayerState, Resource } from '../../shared/contract/types'
import type { GameSyncPayload } from '../../shared/contract/protocol/game'
import type { PlayerScoreSummary } from '../../shared/domain/scoring'
import { parsePositionKey, positionKey } from '../../shared/domain/farm'
import { hasHealthyWorkerAtHome } from '../../shared/moor/heating'
import { isMoorSpecialActionCardUsableByPlayer, isMoorSpecialActionId } from '../../shared/moor/special-actions'
import type { MoorSpecialActionCardState, MoorSpecialActionId } from '../../shared/moor/types'
import type { Locale } from '../../shared/i18n'
import type { PlayerScoreRow } from '../components/board/ScorePanel'
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

export const shouldShowPendingChoiceInInteractionBar = (
  pendingChoice: { promptKey?: string } | null,
): boolean =>
  !!pendingChoice && pendingChoice.promptKey !== 'ui.interactionExchangeChoice'

export const devResourceKeysForState = (
  state?: { enableFarmersOfTheMoor?: boolean } | null,
): (keyof Resource)[] =>
  state?.enableFarmersOfTheMoor === true ? extendedResourceKeyList : resourceKeyList

export const canTakeVisibleMoorSpecialAction = (
  state: GameState,
  currentPlayer: PlayerState,
  card: MoorSpecialActionCardState,
  actionId: MoorSpecialActionId,
): boolean => {
  if (state.players[state.currentPlayerIndex]?.id !== currentPlayer.id) return false
  if (!isMoorSpecialActionCardUsableByPlayer(card, currentPlayer.id)) return false
  if (!hasHealthyWorkerAtHome(state, currentPlayer)) return false
  const borrowFood = card.location.kind === 'playerFaceUp' && card.location.playerId !== currentPlayer.id ? 2 : 0
  const actionFood =
    actionId === 'horse-market' && [2, 5, 6].includes(state.players.length) ? 1
      : actionId === 'illicit-work' ? 1
        : 0
  const actionFuel = actionId === 'black-market' || actionId === 'illicit-work' ? 1 : 0
  return (
    currentPlayer.resources.food >= borrowFood + actionFood &&
    (currentPlayer.resources.fuel ?? 0) >= actionFuel
  )
}

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

type CompactScorePlayer = {
  id: string
  name: string
}

export const buildCompactScoreRows = (
  state: { players: readonly CompactScorePlayer[] } | null | undefined,
  scores: readonly PlayerScoreSummary[] | null | undefined,
  selfPlayerId: string | null | undefined,
): PlayerScoreRow[] => {
  if (!state) return []
  const summaryById = new Map((scores ?? []).map((score) => [score.playerId, score]))
  const myId = selfPlayerId ?? null
  return state.players.map((player) => {
    const summary = summaryById.get(player.id)
    const catTotal = (key: string): number =>
      summary?.categories.find((category) => category.key === key)?.total ?? 0
    return {
      id: player.id,
      name: player.name,
      isYou: myId !== null && player.id === myId,
      total: summary?.total ?? 0,
      breakdown: {
        fields:
          catTotal('fields') +
          catTotal('grains') +
          catTotal('vegetables') +
          catTotal('pastures'),
        animals:
          catTotal('sheeps') +
          catTotal('boars') +
          catTotal('cattles') +
          catTotal('stables'),
        cardBonusVp: catTotal('cardBonusVp'),
        family: catTotal('farmers') + catTotal('clayRooms') + catTotal('stoneRooms'),
        cards: catTotal('cards'),
      },
    }
  })
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

export const buildPlaceFarmerChoiceMap = (
  promptKey: string | undefined,
  options: readonly ActionChoiceOption[] | undefined,
): Map<string, ActionChoiceOption> => {
  if (promptKey !== 'ui.interactionPlaceFarmerExtra') return new Map()
  const entries = (options ?? []).map((option) => {
    const spaceId = option.value.startsWith(OCCUPIED_SPACE_CHOICE_PREFIX)
      ? option.value.slice(OCCUPIED_SPACE_CHOICE_PREFIX.length)
      : option.value
    return [spaceId, option] as const
  })
  return new Map(entries)
}

export type PendingMoorSpecialActionChoice = {
  value: string
  cardId: string
  actionId: MoorSpecialActionId
  tile?: FarmTilePosition
  tileKey?: string
  disabled: boolean
}

export type PendingMoorSpecialActionChoiceMaps = {
  isActive: boolean
  byCardAction: Map<string, PendingMoorSpecialActionChoice>
  byCardActionTile: Map<string, PendingMoorSpecialActionChoice>
  selectableTileKeysByCardAction: Map<string, Set<string>>
}

export const pendingMoorSpecialActionKey = (
  cardId: string,
  actionId: MoorSpecialActionId,
): string => `${cardId}:${actionId}`

export const pendingMoorSpecialActionTileKey = (
  cardId: string,
  actionId: MoorSpecialActionId,
  tileKey: string,
): string => `${cardId}:${actionId}:${tileKey}`

export const parsePendingMoorSpecialActionChoice = (
  option: ActionChoiceOption,
): PendingMoorSpecialActionChoice | null => {
  const prefix = 'card-action:'
  if (!option.value.startsWith(prefix)) return null
  const parts = option.value.slice(prefix.length).split(':')
  const cardId = parts[0]
  const actionMarker = parts[1]
  const actionId = parts[2]
  if (!cardId || actionMarker !== 'action' || !actionId) return null
  if (!isMoorSpecialActionId(actionId)) return null
  if (parts.length !== 3 && parts.length !== 5) return null
  if (parts.length === 5) {
    const row = Number(parts[3])
    const col = Number(parts[4])
    if (!Number.isFinite(row) || !Number.isFinite(col)) return null
    const tile = { row, col }
    return {
      value: option.value,
      cardId,
      actionId,
      tile,
      tileKey: positionKey(tile),
      disabled: option.disabled === true,
    }
  }
  return {
    value: option.value,
    cardId,
    actionId,
    disabled: option.disabled === true,
  }
}

export const buildPendingMoorSpecialActionChoiceMaps = (
  options?: readonly ActionChoiceOption[],
): PendingMoorSpecialActionChoiceMaps => {
  const byCardAction = new Map<string, PendingMoorSpecialActionChoice>()
  const byCardActionTile = new Map<string, PendingMoorSpecialActionChoice>()
  const selectableTileKeysByCardAction = new Map<string, Set<string>>()
  for (const option of options ?? []) {
    const parsed = parsePendingMoorSpecialActionChoice(option)
    if (!parsed) continue
    const actionKey = pendingMoorSpecialActionKey(parsed.cardId, parsed.actionId)
    if (!parsed.tileKey) {
      if (!parsed.disabled) byCardAction.set(actionKey, parsed)
      continue
    }
    if (parsed.disabled) continue
    byCardActionTile.set(
      pendingMoorSpecialActionTileKey(parsed.cardId, parsed.actionId, parsed.tileKey),
      parsed,
    )
    const tileKeys = selectableTileKeysByCardAction.get(actionKey) ?? new Set<string>()
    tileKeys.add(parsed.tileKey)
    selectableTileKeysByCardAction.set(actionKey, tileKeys)
  }
  return {
    isActive: byCardAction.size > 0 || byCardActionTile.size > 0,
    byCardAction,
    byCardActionTile,
    selectableTileKeysByCardAction,
  }
}

export const shouldSuppressPendingChoiceOptionsInInteractionBar = (
  pendingChoice: { options?: readonly ActionChoiceOption[] } | null,
): boolean =>
  (pendingChoice?.options ?? []).some((option) =>
    parsePendingMoorSpecialActionChoice(option) !== null,
  )

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

const FIXED_DEV_ROOM_IDS = new Set(['dev2', 'dev3', 'dev4', 'dev5', 'dev6'])

export const maxPlayersFromQuery = (search: string): number => {
  const raw = Number(new URLSearchParams(search).get('maxPlayers'))
  if (!Number.isFinite(raw)) return 2
  return Math.min(Math.max(2, Math.floor(raw)), 6)
}

export const enableThroughTheSeasonsFromQuery = (search: string): boolean =>
  new URLSearchParams(search).get('enableThroughTheSeasons') === 'true'

export const enableFarmersOfTheMoorFromQuery = (search: string): boolean =>
  new URLSearchParams(search).get('enableFarmersOfTheMoor') === 'true'

export const allowIncompleteFarmersOfTheMoorMinorDealFromQuery = (search: string): boolean =>
  new URLSearchParams(search).get('allowIncompleteFarmersOfTheMoorMinorDeal') === 'true'

export const splitBoardActionSpaces = (
  actionSpaces: readonly ActionSpace[] | null | undefined,
  roundActionOrder: readonly (string | null | undefined)[] | null | undefined,
): { baseActions: ActionSpace[]; seasonActions: ActionSpace[] } => {
  if (!actionSpaces || !roundActionOrder) return { baseActions: [], seasonActions: [] }
  const roundIds = new Set(roundActionOrder.filter((id): id is string => !!id))
  const seasonIds = new Set(seasonActionIds)
  return {
    baseActions: actionSpaces.filter((space) => !roundIds.has(space.id) && !seasonIds.has(space.id)),
    seasonActions: actionSpaces.filter((space) => seasonIds.has(space.id)),
  }
}

export const isDevModeAllowedFromQuery = (search: string): boolean => {
  const params = new URLSearchParams(search)
  if (params.get('devMode') !== '1') return false
  const page = params.get('page')
  const roomId = params.get('room')
  if (!page) {
    if (params.get('transport') === 'ws' || roomId) return !!roomId && FIXED_DEV_ROOM_IDS.has(roomId)
    return true
  }
  if (page === 'lobby' || page === 'workshop') return true
  if (roomId && FIXED_DEV_ROOM_IDS.has(roomId)) return true
  return params.get('embedded') === '1' && params.get('transport') !== 'ws'
}
