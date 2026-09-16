import { extendedResourceKeyList, resourceKeyList } from '../../shared/contract/state-constants'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../shared/contract/placement-constants'
import { seasonActionIds } from '../../shared/projections/season-actions'
import type { ActionChoiceOption, ActionSpace, FarmTilePosition, GameState, PlayerState, Resource } from '../../shared/contract/types'
import type { PlayerScoreSummary } from '../../shared/domain/scoring'
import { parsePositionKey, positionKey } from '../../shared/domain/farm'
import { isMoorSpecialActionId } from '../../shared/projections/moor-special-actions'
import type { MoorSpecialActionCardState, MoorSpecialActionId } from '../../shared/moor/types'
import type { PlayerScoreRow } from '../components/board/ScorePanel'
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

export const shouldShowDevPanel = ({
  devMode,
  hasGameView,
}: {
  devMode: boolean
  hasGameView: boolean
}): boolean => devMode && hasGameView

export const canTakeVisibleMoorSpecialAction = (
  state: GameState,
  currentPlayer: PlayerState & { moorSpecialActionAvailability?: Record<string, Partial<Record<MoorSpecialActionId, boolean>>> },
  card: MoorSpecialActionCardState,
  actionId: MoorSpecialActionId,
): boolean =>
  state.players[state.currentPlayerIndex]?.id === currentPlayer.id
  && currentPlayer.moorSpecialActionAvailability?.[card.id]?.[actionId] === true

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

const MINOR_IMPROVEMENT_CHOICE_PREFIX = 'minor:'
const MAJOR_IMPROVEMENT_CHOICE_PREFIX = 'major:'

const stripChoicePrefix = (value: string, prefix: string): string =>
  value.startsWith(prefix) ? value.slice(prefix.length) : value

export const buildSelectableMinorIds = (
  options: readonly ActionChoiceOption[] | undefined,
): Set<string> =>
  new Set(
    (options ?? [])
      .map((option) => stripChoicePrefix(option.value, MINOR_IMPROVEMENT_CHOICE_PREFIX))
      .filter((value) => !value.startsWith(MAJOR_IMPROVEMENT_CHOICE_PREFIX)),
  )

export const buildSelectableMajorIds = (
  options: readonly ActionChoiceOption[] | undefined,
  availableMajorImprovements: readonly string[] | undefined,
): Set<string> => {
  const available = new Set(availableMajorImprovements ?? [])
  return new Set(
    (options ?? [])
      .map((option) => stripChoicePrefix(option.value, MAJOR_IMPROVEMENT_CHOICE_PREFIX))
      .filter((value) => available.has(value)),
  )
}

export const buildSelectableOccupationIds = (
  options: readonly ActionChoiceOption[] | undefined,
): Set<string> => new Set((options ?? []).map((option) => option.value))

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

export const getPendingMoorSpecialActionChoice = (
  choices: PendingMoorSpecialActionChoiceMaps,
  cardId: string,
  actionId: MoorSpecialActionId,
): PendingMoorSpecialActionChoice | undefined =>
  choices.byCardAction.get(pendingMoorSpecialActionKey(cardId, actionId))

export const getPendingMoorSpecialActionTileChoice = (
  choices: PendingMoorSpecialActionChoiceMaps,
  cardId: string,
  actionId: MoorSpecialActionId,
  tile: FarmTilePosition,
): PendingMoorSpecialActionChoice | undefined =>
  choices.byCardActionTile.get(
    pendingMoorSpecialActionTileKey(cardId, actionId, positionKey(tile)),
  )

export const getPendingMoorSpecialActionTileKeys = (
  choices: PendingMoorSpecialActionChoiceMaps,
  cardId: string,
  actionId: MoorSpecialActionId,
): Set<string> =>
  new Set(
    choices.selectableTileKeysByCardAction.get(
      pendingMoorSpecialActionKey(cardId, actionId),
    ) ?? [],
  )

export const hasPendingMoorSpecialActionChoice = (
  choices: PendingMoorSpecialActionChoiceMaps,
  cardId: string,
  actionId: MoorSpecialActionId,
): boolean =>
  getPendingMoorSpecialActionChoice(choices, cardId, actionId) !== undefined ||
  getPendingMoorSpecialActionTileKeys(choices, cardId, actionId).size > 0

export const shouldSuppressPendingChoiceOptionsInInteractionBar = (
  pendingChoice: { options?: readonly ActionChoiceOption[] } | null,
): boolean =>
  (pendingChoice?.options ?? []).some((option) =>
    parsePendingMoorSpecialActionChoice(option) !== null,
  )

const FIXED_DEV_ROOM_IDS = new Set(['dev2', 'dev3', 'dev4', 'dev5', 'dev6'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isDevRoomId = (roomId: string): boolean => {
  for (const id of FIXED_DEV_ROOM_IDS) {
    if (roomId === id) return true
    if (roomId.startsWith(`${id}-`) && UUID_PATTERN.test(roomId.slice(id.length + 1))) return true
  }
  return false
}

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
    if (params.get('transport') === 'ws' || roomId) return !!roomId && isDevRoomId(roomId)
    return true
  }
  if (page === 'lobby' || page === 'workshop') return true
  if (roomId && isDevRoomId(roomId)) return true
  return params.get('embedded') === '1' && params.get('transport') !== 'ws'
}
