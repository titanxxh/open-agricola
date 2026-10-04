import type { ClientInteractionState } from '../../shared/contract/protocol/game'
import { ALL_ANIMAL_KEYS, type AnimalKey } from '../../shared/contract/animals'
import type {
  ActionSpace,
  CardResourceStats,
  CropStack,
  FarmTilePosition,
  FutureMeepleResourceMap,
  GameState,
  InteractionAnimalReorgZone,
  InteractionFarmSelection,
  InteractionSelection,
  PlayerState,
} from '../../shared/contract/types'
import type { Locale } from '../../shared/i18n'
import { translateCardText } from '../components/common/cardText'
import { getPlayerDisplayName } from '../utils/player-name'
import {
  getAdjacentTilesForEdge,
  getFarmyardBounds,
  getFarmyardTileKeySet,
  parsePositionKey,
  positionKey,
} from '../../shared/domain/farm'
import { getPlayedCardKeys } from '../../shared/domain/player'
import {
  ACTION_SPACE_ATTACHMENTS_KEY,
  RESERVED_ACTION_SPACES_KEY,
  readCardResourceStats,
  type ActionSpaceAttachment,
} from '../../shared/cards/helpers/card-state'
import { readAllPublicCardMarkers, type PublicCardMarkerEntry } from '../../shared/cards/helpers/public-card-markers'
import { getWorkerHeldOnCard } from '../../shared/cards/helpers/card-held-workers'
import {
  M084_BOG_PONY_ID,
  readBogPonyLyingHorseCountFromExtraData,
} from '../../shared/projections/bog-pony-state'
import { getLeftBoardActionSpaceId } from '../../shared/cards/helpers/round-action-topology'
import type { ParentCardId } from '../../shared/parents'
import type { AnimalReorgState, ExtraSowTarget, PendingAnimalReorg, PendingSowCrop } from '../types/ui'
import {
  buildBorrowedPlayedCardDisplays,
  buildCardDisplayMap,
  buildFarmCardDisplayMap,
  buildPastureDisplayMap,
  buildStableDisplayMap,
  computeReorgAvailableAnimals,
  type BorrowedPlayedCardDisplay,
  type CardAnimalDisplay,
} from './hooks/use-animal-reorg-flow'

export type FarmBoardProjectionCell = {
  key: string
  type: 'tile' | 'post' | 'fence-h' | 'fence-v' | 'void'
  tileRow?: number
  tileCol?: number
  fenceId?: string
  tileKey?: string
  isRoom?: boolean
  isField?: boolean
  isStable?: boolean
  fieldInfo?: FarmBoardProjectionFieldInfo
  terrain?: NonNullable<PlayerState['farmTerrain']>[number]
  terrainMarkers?: FarmBoardProjectionTerrainMarker[]
  isPendingRoom?: boolean
  isPendingStable?: boolean
  isRoomSelectable?: boolean
  isStableSelectable?: boolean
  isPositionSelectable?: boolean
  sowSelectableCrops?: PendingSowCrop[]
  isLocked?: boolean
}

export type FarmBoardProjectionFieldInfo = { stacks: CropStack[] }
export type FarmBoardProjectionAnimalDisplay = {
  animalType: AnimalKey | null
  animalCount: number
}
export type FarmBoardProjectionPastureTile = { pastureId: string; isCorner: boolean }
export type FarmBoardProjectionAnimalTotals = Record<AnimalKey, number>
export type FarmBoardProjectionCardType = 'occupation' | 'minor' | 'major'
export type FarmBoardProjectionParentCardDisplay = {
  id: ParentCardId
  infobox?: string
  completedTier?: 1 | 2 | 3
}
export type FarmBoardProjectionPlayedCardDisplay = {
  cardId: string
  rawId: string
  cardType: FarmBoardProjectionCardType
  infobox?: string
  displayCounters: Record<string, number>
  resourceStats?: CardResourceStats
  stack: string[]
  cardStacks: CropStack[] | null
  cardStackSelectionTiles: (FarmTilePosition | null)[]
  heldWorkerId?: string
  m084LyingHorses: number
}
export type FarmBoardProjectionTerrainMarker = {
  row: number
  col: number
  kind: string
  workerId?: string
  sourceCard?: string
}
export type ActionBoardPlayerDisplay = Pick<PlayerState, 'id' | 'name' | 'color'>
export type ActionSpaceAttachmentDisplay = ActionBoardPlayerDisplay & {
  resource: keyof FutureMeepleResourceMap
  amount: number
}
export type ActionBoardProjection = {
  actionSpaceReservations: Map<string, ActionBoardPlayerDisplay>
  actionSpaceAttachments: Map<string, ActionSpaceAttachmentDisplay[]>
  leftActionNames: Map<string, string>
}
export type ActionBoardProjectionInput = {
  locale: Locale
  players: PlayerState[]
  baseActions: ActionSpace[]
  roundSlots: readonly { round: number; action?: ActionSpace }[]
  currentRound: number
}

export type FarmBoardProjection = {
  farmCells: FarmBoardProjectionCell[]
  farmGridColumns: number
  roomPositions: Set<string>
  fieldMap: Map<string, FarmBoardProjectionFieldInfo>
  stablePositions: Set<string>
  pendingRoomSet: Set<string>
  pendingStableSet: Set<string>
  roomSelectableSet: Set<string>
  stableSelectableSet: Set<string>
  farmHandSelectableSet: Set<string>
  pendingFarmHandKey: string | null
  builtSpecialStableKeys: Set<string>
  positionSelectableSet: Set<string>
  sowSelectableMap: Map<string, PendingSowCrop[]>
  extraSowTargets: ExtraSowTarget[]
  existingFenceSet: Set<string>
  fenceSelectableSet: Set<string>
  pastureTiles: Map<string, FarmBoardProjectionPastureTile>
  pastureDisplayMap: Map<string, FarmBoardProjectionAnimalDisplay>
  pastureCapacityMap: Map<string, number>
  houseDisplay: FarmBoardProjectionAnimalDisplay
  stableDisplayMap: Map<string, FarmBoardProjectionAnimalDisplay>
  cardDisplayMap: Map<string, CardAnimalDisplay>
  farmCardDisplayMap: Map<string, CardAnimalDisplay>
  borrowedPlayedCardDisplays: BorrowedPlayedCardDisplay[]
  reorgRemaining: FarmBoardProjectionAnimalTotals | null
  lockedTileKeys: Set<string>
  publicCardMarkers: PublicCardMarkerEntry[]
  farmTerrainMarkerMap: Map<string, FarmBoardProjectionTerrainMarker[]>
  parentCardDisplays: FarmBoardProjectionParentCardDisplay[]
  playedCardDisplays: FarmBoardProjectionPlayedCardDisplay[]
}

export type FarmBoardProjectionInput = {
  displayPlayer: (PlayerState & { lockedFarmTileKeys?: readonly string[] }) | null | undefined
  interaction: ClientInteractionState
  farmInteraction?: InteractionFarmSelection | null
  selectionInteraction: InteractionSelection | null | undefined
  players?: readonly Pick<PlayerState, 'id'>[]
  state?: GameState | null
  pastureCapacities?: Record<string, Record<string, number>>
  animalReorg?: AnimalReorgState | null
  pendingAnimalReorg?: PendingAnimalReorg | null
  pendingRoomTiles?: readonly FarmTilePosition[]
  pendingStableTiles?: readonly FarmTilePosition[]
  pendingFarmHand?: FarmTilePosition | null
  extraPositionSelectableSet?: ReadonlySet<string>
}

type DisplayPlayerWithSpecialStables = PlayerState & {
  specialStables?: readonly { position: FarmTilePosition }[]
}

const emptyAnimalTotals = (): FarmBoardProjectionAnimalTotals =>
  ALL_ANIMAL_KEYS.reduce((acc, animal) => {
    acc[animal] = 0
    return acc
  }, {} as FarmBoardProjectionAnimalTotals)

const animalCountsTotal = (counts: Partial<Record<AnimalKey, number>>) =>
  ALL_ANIMAL_KEYS.reduce((sum, animal) => sum + Math.max(0, counts[animal] ?? 0), 0)

const parentFatherCompletedTier = (value: unknown): 1 | 2 | 3 | undefined =>
  value === 1 || value === 2 || value === 3 ? value : undefined

const isFarmTerrainMarker = (value: unknown): value is FarmBoardProjectionTerrainMarker => {
  if (!value || typeof value !== 'object') return false
  const marker = value as Partial<FarmBoardProjectionTerrainMarker>
  return Number.isInteger(marker.row) && Number.isInteger(marker.col) && typeof marker.kind === 'string'
}

const readFarmTerrainMarkers = (player: PlayerState): FarmBoardProjectionTerrainMarker[] =>
  Object.entries(player.cardStates ?? {}).flatMap(([cardId, state]) => {
    const raw = state.extraData?.farmTerrainMarkers
    if (!Array.isArray(raw)) return []
    return raw.filter(isFarmTerrainMarker).map((marker) => ({
      ...marker,
      sourceCard: typeof marker.sourceCard === 'string' ? marker.sourceCard : cardId,
      workerId: typeof marker.workerId === 'string' ? marker.workerId : undefined,
    }))
  })

const buildFarmTerrainMarkerMap = (
  displayPlayer: PlayerState | null | undefined,
): Map<string, FarmBoardProjectionTerrainMarker[]> => {
  const map = new Map<string, FarmBoardProjectionTerrainMarker[]>()
  if (!displayPlayer) return map
  readFarmTerrainMarkers(displayPlayer).forEach((marker) => {
    const key = `${marker.row}-${marker.col}`
    map.set(key, [...(map.get(key) ?? []), marker])
  })
  return map
}

const C146_WORKSHOP_ASSISTANT_ID = 'C146_WorkshopAssistant'
const PLAYED_CARD_INTERNAL_COUNTERS = new Set(['usedRound'])
const CROP_KINDS = new Set(['grain', 'vegetable', 'wood', 'stone'])

const isCropKind = (value: unknown): value is CropStack['kind'] =>
  typeof value === 'string' && CROP_KINDS.has(value)

const normalizeCropStack = (kind: unknown, remaining: unknown): CropStack | null =>
  isCropKind(kind) && typeof remaining === 'number' && remaining > 0
    ? { kind, remaining }
    : null

const readCardFieldLayers = (extraData: Record<string, unknown> | undefined) => {
  const slots = extraData?.cardFieldStacks
  if (!Array.isArray(slots)) return null
  return slots.flatMap((entry, slotIndex) => {
    if (!entry || typeof entry !== 'object') return []
    const slot = entry as { crop?: unknown; remaining?: unknown; below?: unknown[] }
    const layers = [...(Array.isArray(slot.below) ? slot.below : []), slot]
    return layers.flatMap((layer, layerIndex) => {
      if (!layer || typeof layer !== 'object') return []
      const value = layer as { crop?: unknown; remaining?: unknown }
      const stack = normalizeCropStack(value.crop, value.remaining)
      return stack ? [{ stack, slotIndex, top: layerIndex === layers.length - 1 }] : []
    })
  })
}

const readCardStacksFromExtraData = (extraData: Record<string, unknown> | undefined): CropStack[] | null => {
  const fieldLayers = readCardFieldLayers(extraData)
  if (fieldLayers) return fieldLayers.map((layer) => layer.stack)

  const rawStacks = extraData?.stacks
  if (Array.isArray(rawStacks) && rawStacks.length > 0) {
    return rawStacks
      .map((entry) => {
        const stack = entry as { kind?: unknown; remaining?: unknown }
        return normalizeCropStack(stack.kind, stack.remaining)
      })
      .filter((entry): entry is CropStack => !!entry)
  }

  const rawCardCrop = extraData?.cardCrop as { crop?: unknown; remaining?: unknown } | undefined
  const cropStack = normalizeCropStack(rawCardCrop?.crop, rawCardCrop?.remaining)
  return cropStack ? [cropStack] : null
}

const splitPlayedCardKey = (cardId: string): { rawId: string; cardType: FarmBoardProjectionCardType } => {
  const [kind, rawId] = cardId.includes(':') ? cardId.split(':') : ['', cardId]
  if (kind === 'occupation') return { rawId, cardType: 'occupation' }
  if (kind === 'minor') return { rawId, cardType: 'minor' }
  return { rawId, cardType: 'major' }
}

const buildParentCardDisplays = (
  displayPlayer: PlayerState | null | undefined,
): FarmBoardProjectionParentCardDisplay[] => {
  if (!displayPlayer?.parentCards) return []
  return [displayPlayer.parentCards.mother, displayPlayer.parentCards.father]
    .filter((id): id is ParentCardId => !!id)
    .map((id) => ({
      id,
      infobox: displayPlayer.cardStates?.[id]?.infobox,
      completedTier: parentFatherCompletedTier(displayPlayer.cardStates?.[id]?.extraData?.fatherCompletedTier),
    }))
}

const buildPlayedCardDisplays = (
  displayPlayer: PlayerState | null | undefined,
  selectionInteraction: InteractionSelection | null | undefined,
): FarmBoardProjectionPlayedCardDisplay[] => {
  if (!displayPlayer) return []
  return getPlayedCardKeys(displayPlayer).map((cardId) => {
    const { rawId, cardType } = splitPlayedCardKey(cardId)
    const cardState = displayPlayer.cardStates?.[rawId]
    const rawExtraData = cardState?.extraData
    const c146Pairs =
      rawId === C146_WORKSHOP_ASSISTANT_ID && Array.isArray(rawExtraData?.pairs)
        ? rawExtraData.pairs.filter((pair): pair is string => typeof pair === 'string')
        : null
    const displayCounters = Object.fromEntries(
      Object.entries(cardState?.counters ?? {})
        .filter(([key, count]) => !PLAYED_CARD_INTERNAL_COUNTERS.has(key) && count > 0),
    )
    const cardStacks = readCardStacksFromExtraData(rawExtraData)
    const cardSelectionTargets = selectionInteraction?.kind === 'farm-position'
      ? selectionInteraction.selectablePositions.filter((position) => position.sourceCard === rawId)
      : []
    return {
      cardId,
      rawId,
      cardType,
      infobox: cardState?.infobox,
      displayCounters,
      resourceStats: readCardResourceStats(displayPlayer, rawId),
      stack: c146Pairs ?? cardState?.stack ?? [],
      cardStacks,
      cardStackSelectionTiles: readCardFieldLayers(rawExtraData)?.map((layer) =>
        layer.top ? cardSelectionTargets.find((position) => position.cardFieldSlot === layer.slotIndex) ?? null : null,
      ) ?? cardStacks?.map(() => null) ?? [],
      heldWorkerId: getWorkerHeldOnCard(displayPlayer, rawId),
      m084LyingHorses: rawId === M084_BOG_PONY_ID
        ? readBogPonyLyingHorseCountFromExtraData(rawExtraData)
        : 0,
    }
  })
}

const zoneAnimalCounts = (zone: InteractionAnimalReorgZone) => {
  const counts = emptyAnimalTotals()
  for (const animal of ALL_ANIMAL_KEYS) {
    counts[animal] = Math.max(0, Math.floor(zone.animalCounts?.[animal] ?? 0))
  }
  if (animalCountsTotal(counts) > 0) return counts
  if (zone.animalType) counts[zone.animalType] = Math.max(0, Math.floor(zone.animalCount ?? 0))
  return counts
}

const addAnimalCounts = (
  target: FarmBoardProjectionAnimalTotals,
  counts: Partial<Record<AnimalKey, number>>,
) => {
  for (const animal of ALL_ANIMAL_KEYS) {
    target[animal] += counts[animal] ?? 0
  }
}

const buildFarmCells = (
  displayPlayer: PlayerState,
  interaction: ClientInteractionState,
  selectionInteraction: InteractionSelection | null | undefined,
  players: readonly Pick<PlayerState, 'id'>[],
) => {
  const bounds = { ...getFarmyardBounds(displayPlayer) }
  const tileKeys = new Set(getFarmyardTileKeySet(displayPlayer))
  const pendingSelectionTiles =
    interaction.stateId === 'wait' &&
    selectionInteraction?.kind === 'farm-position' &&
    players[interaction.playerIndex]?.id === displayPlayer.id
      ? selectionInteraction.selectablePositions.filter((position) => !position.sourceCard)
      : []
  pendingSelectionTiles.forEach((tile) => {
    tileKeys.add(positionKey(tile))
    bounds.minRow = Math.min(bounds.minRow, tile.row)
    bounds.maxRow = Math.max(bounds.maxRow, tile.row)
    bounds.minCol = Math.min(bounds.minCol, tile.col)
    bounds.maxCol = Math.max(bounds.maxCol, tile.col)
  })
  const rows = (bounds.maxRow - bounds.minRow + 1) * 2 + 1
  const cols = (bounds.maxCol - bounds.minCol + 1) * 2 + 1
  const cells: FarmBoardProjectionCell[] = []
  const hasAdjacentTileForPost = (boundaryRow: number, boundaryCol: number) =>
    [
      { row: boundaryRow - 1, col: boundaryCol - 1 },
      { row: boundaryRow - 1, col: boundaryCol },
      { row: boundaryRow, col: boundaryCol - 1 },
      { row: boundaryRow, col: boundaryCol },
    ].some((tile) => tileKeys.has(positionKey(tile)))
  const hasAdjacentTileForEdge = (edgeId: string) =>
    getAdjacentTilesForEdge(edgeId).some((tile: FarmTilePosition) =>
      tileKeys.has(positionKey(tile)),
    )
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const isTile = row % 2 === 1 && col % 2 === 1
    const isPost = row % 2 === 0 && col % 2 === 0
    const isFenceH = row % 2 === 0 && col % 2 === 1
    const isFenceV = row % 2 === 1 && col % 2 === 0
    const tileRow = isTile ? bounds.minRow + (row - 1) / 2 : undefined
    const tileCol = isTile ? bounds.minCol + (col - 1) / 2 : undefined
    const boundaryRow = bounds.minRow + row / 2
    const boundaryCol = bounds.minCol + col / 2
    const fenceId = isFenceH
      ? `H-${boundaryRow}-${bounds.minCol + (col - 1) / 2}`
      : isFenceV
        ? `V-${bounds.minRow + (row - 1) / 2}-${boundaryCol}`
        : undefined
    const type =
      isTile
        ? tileKeys.has(positionKey({ row: tileRow!, col: tileCol! })) ? 'tile' : 'void'
        : isFenceH || isFenceV
          ? fenceId && hasAdjacentTileForEdge(fenceId)
            ? isFenceH ? 'fence-h' : 'fence-v'
            : 'void'
          : isPost && hasAdjacentTileForPost(boundaryRow, boundaryCol)
            ? 'post'
            : 'void'
    cells.push({
      key: `${row}-${col}`,
      type,
      tileRow,
      tileCol,
      fenceId,
    })
  }
  return { cells, columns: cols }
}

const buildPastureTiles = (displayPlayer: PlayerState | null | undefined) => {
  const map = new Map<string, FarmBoardProjectionPastureTile>()
  ;(displayPlayer?.pastures ?? []).forEach((pasture) => {
    if (!pasture.tiles || pasture.tiles.length === 0) return
    let corner = pasture.tiles[0]
    pasture.tiles.forEach((tile) => {
      if (tile.row > corner.row || (tile.row === corner.row && tile.col > corner.col)) corner = tile
    })
    const cornerKey = positionKey(corner)
    pasture.tiles.forEach((tile) => {
      map.set(positionKey(tile), { pastureId: pasture.id, isCorner: positionKey(tile) === cornerKey })
    })
  })
  return map
}

const buildPastureCapacityMap = (
  displayPlayer: PlayerState | null | undefined,
  pastureCapacities: Record<string, Record<string, number>>,
) => {
  const map = new Map<string, number>()
  ;(displayPlayer?.pastures ?? []).forEach((pasture) => {
    if (pasture.tiles.length > 0) {
      map.set(pasture.id, pastureCapacities[displayPlayer?.id ?? '']?.[pasture.id] ?? 0)
    }
  })
  return map
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

const getCurrentlySelectableRoomKeys = (
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

const isOffBoardSowTile = (tile: FarmTilePosition) =>
  tile.row < 0 || tile.row > 2 || tile.col < 0 || tile.col > 4

const buildSowSelectionDisplay = (
  farmInteraction: InteractionFarmSelection | null | undefined,
) => {
  const sowSelectableMap = new Map<string, PendingSowCrop[]>()
  const extraSowTargets: ExtraSowTarget[] = []
  if (farmInteraction?.farmType !== 'sow') return { sowSelectableMap, extraSowTargets }
  farmInteraction.selectableFields.forEach((entry) => {
    const key = positionKey(entry.tile)
    if (isOffBoardSowTile(entry.tile)) {
      extraSowTargets.push({
        key,
        tile: entry.tile,
        allowedCrops: entry.allowedCrops,
        sourceCard: entry.sourceCard,
        groupKey: entry.groupKey,
      })
      return
    }
    sowSelectableMap.set(key, entry.allowedCrops)
  })
  return { sowSelectableMap, extraSowTargets }
}

const buildFarmTerrainMap = (
  displayPlayer: PlayerState | null | undefined,
): Map<string, NonNullable<PlayerState['farmTerrain']>[number]> =>
  new Map((displayPlayer?.farmTerrain ?? []).map((tile) => [positionKey(tile), tile]))

const attachTileRenderState = (
  farmCells: FarmBoardProjectionCell[],
  {
    terrainMap,
    roomPositions,
    fieldMap,
    stablePositions,
    pendingRoomSet,
    pendingStableSet,
    roomSelectableSet,
    stableSelectableSet,
    positionSelectableSet,
    sowSelectableMap,
    lockedTileKeys,
    farmTerrainMarkerMap,
    farmInteraction,
  }: {
    terrainMap: Map<string, NonNullable<PlayerState['farmTerrain']>[number]>
    roomPositions: Set<string>
    fieldMap: Map<string, FarmBoardProjectionFieldInfo>
    stablePositions: Set<string>
    pendingRoomSet: Set<string>
    pendingStableSet: Set<string>
    roomSelectableSet: Set<string>
    stableSelectableSet: Set<string>
    positionSelectableSet: Set<string>
    sowSelectableMap: Map<string, PendingSowCrop[]>
    lockedTileKeys: Set<string>
    farmTerrainMarkerMap: Map<string, FarmBoardProjectionTerrainMarker[]>
    farmInteraction: InteractionFarmSelection | null | undefined
  },
): FarmBoardProjectionCell[] => {
  const maxStableSelections =
    farmInteraction?.farmType === 'stable' ? farmInteraction.maxSelections : 0
  const maxStableReached =
    maxStableSelections > 0 && pendingStableSet.size >= maxStableSelections
  return farmCells.map((cell) => {
    if (cell.type !== 'tile' || cell.tileRow === undefined || cell.tileCol === undefined) return cell
    const tileKey = positionKey({ row: cell.tileRow, col: cell.tileCol })
    const isPendingStable = pendingStableSet.has(tileKey)
    return {
      ...cell,
      tileKey,
      isRoom: roomPositions.has(tileKey),
      isField: fieldMap.has(tileKey),
      isStable: stablePositions.has(tileKey),
      fieldInfo: fieldMap.get(tileKey),
      terrain: terrainMap.get(tileKey),
      terrainMarkers: farmTerrainMarkerMap.get(tileKey) ?? [],
      isPendingRoom: pendingRoomSet.has(tileKey),
      isPendingStable,
      isRoomSelectable: roomSelectableSet.has(tileKey),
      isStableSelectable:
        stableSelectableSet.has(tileKey) && (!maxStableReached || isPendingStable),
      isPositionSelectable: positionSelectableSet.has(tileKey),
      sowSelectableCrops: sowSelectableMap.get(tileKey) ?? [],
      isLocked: lockedTileKeys.has(tileKey),
    }
  })
}

const buildHouseDisplay = (
  displayPlayer: PlayerState | null | undefined,
  animalReorg: AnimalReorgState | null | undefined,
): FarmBoardProjectionAnimalDisplay => {
  if (animalReorg) {
    const zone = animalReorg.zones.find((entry) => entry.zoneType === 'house')
    return {
      animalType: zone?.animalType ?? null,
      animalCount: zone?.animalCount ?? 0,
    }
  }
  return {
    animalType: displayPlayer?.houseAnimalType ?? null,
    animalCount: displayPlayer?.houseAnimalCount ?? 0,
  }
}

const buildReorgRemaining = (
  state: GameState | null | undefined,
  pendingAnimalReorg: PendingAnimalReorg | null | undefined,
  animalReorg: AnimalReorgState | null | undefined,
) => {
  if (!state) return null
  const playerIndex = pendingAnimalReorg?.playerIndex ?? state.currentPlayerIndex
  const player = state.players[playerIndex]
  if (!player) return null
  const available = computeReorgAvailableAnimals(player)
  const totals = animalReorg?.zones.reduce((acc, zone) => {
    addAnimalCounts(acc, zoneAnimalCounts(zone))
    return acc
  }, emptyAnimalTotals()) ?? emptyAnimalTotals()
  return ALL_ANIMAL_KEYS.reduce((acc, animal) => {
    acc[animal] = Math.max(0, available[animal] - totals[animal])
    return acc
  }, emptyAnimalTotals())
}

const playerDisplay = (locale: Locale, player: PlayerState, playerIndex: number): ActionBoardPlayerDisplay => ({
  id: player.id,
  name: getPlayerDisplayName(locale, player.name, playerIndex),
  color: player.color,
})

export const buildActionBoardProjection = ({
  locale,
  players,
  baseActions,
  roundSlots,
  currentRound,
}: ActionBoardProjectionInput): ActionBoardProjection => {
  const actionSpaceReservations = new Map<string, ActionBoardPlayerDisplay>()
  const actionSpaceAttachments = new Map<string, ActionSpaceAttachmentDisplay[]>()

  for (const player of players) {
    const owner = playerDisplay(locale, player, players.indexOf(player))
    for (const cardState of Object.values(player.cardStates ?? {})) {
      const reservedSpaces = cardState?.extraData?.[RESERVED_ACTION_SPACES_KEY]
      if (Array.isArray(reservedSpaces)) {
        for (const spaceId of reservedSpaces) {
          if (typeof spaceId === 'string') actionSpaceReservations.set(spaceId, owner)
        }
      }

      const attachments = cardState?.extraData?.[ACTION_SPACE_ATTACHMENTS_KEY]
      if (!Array.isArray(attachments)) continue
      for (const attachment of attachments as ActionSpaceAttachment[]) {
        if (!attachment || typeof attachment.spaceId !== 'string') continue
        for (const [resource, amount] of Object.entries(attachment.resources ?? {})) {
          if (typeof amount !== 'number' || amount <= 0) continue
          const items = actionSpaceAttachments.get(attachment.spaceId) ?? []
          items.push({ ...owner, resource: resource as keyof FutureMeepleResourceMap, amount })
          actionSpaceAttachments.set(attachment.spaceId, items)
        }
      }
    }
  }

  const boardActionSpaces = [
    ...baseActions,
    ...roundSlots.map((slot) => slot.action).filter((action): action is ActionSpace => !!action),
  ]
  const actionById = new Map(boardActionSpaces.map((action) => [action.id, action]))
  const roundActionOrder = Array.from({ length: 14 }, (_, index) =>
    roundSlots.find((slot) => slot.round === index + 1)?.action?.id ?? null,
  )
  const leftActionNames = new Map<string, string>()

  for (const action of boardActionSpaces) {
    const leftActionId = getLeftBoardActionSpaceId({
      players,
      round: currentRound,
      roundActionOrder,
      actionSpaces: boardActionSpaces,
    }, action.id)
    const leftAction = leftActionId ? actionById.get(leftActionId) : undefined
    if (leftAction) leftActionNames.set(action.id, translateCardText(locale, leftAction.nameKey))
  }

  return {
    actionSpaceReservations,
    actionSpaceAttachments,
    leftActionNames,
  }
}

export const buildFarmBoardProjection = ({
  displayPlayer,
  interaction,
  farmInteraction,
  selectionInteraction,
  players = [],
  state,
  pastureCapacities = {},
  animalReorg,
  pendingAnimalReorg,
  pendingRoomTiles = [],
  pendingStableTiles = [],
  pendingFarmHand = null,
  extraPositionSelectableSet,
}: FarmBoardProjectionInput): FarmBoardProjection => {
  const roomPositions = new Set(
    (displayPlayer?.roomTiles ?? []).map((pos: FarmTilePosition) => positionKey(pos)),
  )
  const fieldMap = new Map<string, FarmBoardProjectionFieldInfo>()
  ;(displayPlayer?.fields ?? []).forEach((field) => {
    fieldMap.set(positionKey({ row: field.row, col: field.col }), { stacks: field.stacks })
  })
  const stablePositions = new Set(
    (displayPlayer?.stableTiles ?? []).map((pos: FarmTilePosition) => positionKey(pos)),
  )
  const pendingRoomSet = new Set(pendingRoomTiles.map((tile) => positionKey(tile)))
  const pendingStableSet = new Set(pendingStableTiles.map((tile) => positionKey(tile)))
  const roomSelectableSet = farmInteraction?.farmType === 'room'
    ? getCurrentlySelectableRoomKeys(farmInteraction.selectableTiles, roomPositions, pendingRoomSet)
    : new Set<string>()
  const stableSelectableSet = new Set(
    farmInteraction?.farmType === 'stable'
      ? farmInteraction.selectableTiles.map((tile) => positionKey(tile))
      : [],
  )
  const farmHandSelectableSet = new Set(
    farmInteraction?.farmType === 'stable'
      ? (farmInteraction.farmHandPositions ?? []).map((tile) => positionKey(tile))
      : [],
  )
  const pendingFarmHandKey = pendingFarmHand ? positionKey(pendingFarmHand) : null
  const builtSpecialStableKeys = new Set(
    ((displayPlayer as DisplayPlayerWithSpecialStables | null | undefined)?.specialStables ?? [])
      .map((entry) => positionKey(entry.position)),
  )
  const positionSelectableSet = new Set([
    ...(selectionInteraction?.kind === 'farm-position'
      ? selectionInteraction.selectablePositions.map((tile) => positionKey(tile))
      : []),
    ...(extraPositionSelectableSet ?? []),
  ])
  const { sowSelectableMap, extraSowTargets } = buildSowSelectionDisplay(farmInteraction)
  const existingFenceSet = new Set((displayPlayer?.fenceSegments ?? []).map((segment) => segment.edge))
  const fenceSelectableSet = new Set(
    farmInteraction?.farmType === 'fence'
      ? farmInteraction.selectableEdges
      : [],
  )
  const pastureTiles = buildPastureTiles(displayPlayer)
  const pastureDisplayMap = buildPastureDisplayMap(displayPlayer, animalReorg)
  const pastureCapacityMap = buildPastureCapacityMap(displayPlayer, pastureCapacities)
  const houseDisplay = buildHouseDisplay(displayPlayer, animalReorg)
  const stableDisplayMap = buildStableDisplayMap(displayPlayer, animalReorg)
  const cardDisplayMap = buildCardDisplayMap(displayPlayer, animalReorg)
  const farmCardDisplayMap = buildFarmCardDisplayMap(displayPlayer, animalReorg)
  const borrowedPlayedCardDisplays = buildBorrowedPlayedCardDisplays(state, displayPlayer, animalReorg)
  const reorgRemaining = buildReorgRemaining(state, pendingAnimalReorg, animalReorg)
  const lockedTileKeys = new Set(displayPlayer?.lockedFarmTileKeys ?? [])
  const publicCardMarkers = displayPlayer ? readAllPublicCardMarkers(displayPlayer) : []
  const farmTerrainMarkerMap = buildFarmTerrainMarkerMap(displayPlayer)
  const terrainMap = buildFarmTerrainMap(displayPlayer)
  const parentCardDisplays = buildParentCardDisplays(displayPlayer)
  const activeSelection =
    interaction.stateId === 'wait' &&
    players[interaction.playerIndex]?.id === displayPlayer?.id
      ? selectionInteraction
      : null
  const playedCardDisplays = buildPlayedCardDisplays(displayPlayer, activeSelection)
  if (!displayPlayer) {
    return {
      farmCells: [],
      farmGridColumns: 11,
      roomPositions,
      fieldMap,
      stablePositions,
      pendingRoomSet,
      pendingStableSet,
      roomSelectableSet,
      stableSelectableSet,
      farmHandSelectableSet,
      pendingFarmHandKey,
      builtSpecialStableKeys,
      positionSelectableSet,
      sowSelectableMap,
      extraSowTargets,
      existingFenceSet,
      fenceSelectableSet,
      pastureTiles,
      pastureDisplayMap,
      pastureCapacityMap,
      houseDisplay,
      stableDisplayMap,
      cardDisplayMap,
      farmCardDisplayMap,
      borrowedPlayedCardDisplays,
      reorgRemaining,
      lockedTileKeys,
      publicCardMarkers,
      farmTerrainMarkerMap,
      parentCardDisplays,
      playedCardDisplays,
    }
  }
  const farmGrid = buildFarmCells(displayPlayer, interaction, selectionInteraction, players)
  const farmCells = attachTileRenderState(farmGrid.cells, {
    terrainMap,
    roomPositions,
    fieldMap,
    stablePositions,
    pendingRoomSet,
    pendingStableSet,
    roomSelectableSet,
    stableSelectableSet,
    positionSelectableSet,
    sowSelectableMap,
    lockedTileKeys,
    farmTerrainMarkerMap,
    farmInteraction,
  })
  return {
    farmCells,
    farmGridColumns: farmGrid.columns,
    roomPositions,
    fieldMap,
    stablePositions,
    pendingRoomSet,
    pendingStableSet,
    roomSelectableSet,
    stableSelectableSet,
    farmHandSelectableSet,
    pendingFarmHandKey,
    builtSpecialStableKeys,
    positionSelectableSet,
    sowSelectableMap,
    extraSowTargets,
    existingFenceSet,
    fenceSelectableSet,
    pastureTiles,
    pastureDisplayMap,
    pastureCapacityMap,
    houseDisplay,
    stableDisplayMap,
    cardDisplayMap,
    farmCardDisplayMap,
    borrowedPlayedCardDisplays,
    reorgRemaining,
    lockedTileKeys,
    publicCardMarkers,
    farmTerrainMarkerMap,
    parentCardDisplays,
    playedCardDisplays,
  }
}
