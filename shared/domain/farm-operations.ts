import { planFarmyardExtension } from './farmyard-extensions'
import type { FarmTerrainKind } from '../moor/types'
import type { FarmOperationResult, FarmTilePosition, FarmyardExtension, FarmyardSpaceState, PlayerState, Resource } from '../contract/types'
import type { EventSink, FarmTerrainChangedEvent } from '../contract/events'
import { parsePositionKey, getFarmyardTilePositions, positionKey } from './farmyard-geometry'
import { normalizeFarmyardSpaceStates, getFarmyardSpaceStates } from './farmyard-space-states'
import { getNewlyUsedFarmyardTiles, getUsedFarmyardTileKeys } from './farmyard-usage'

export type FarmOperation = (
  | { kind: 'space-states'; states: FarmyardSpaceState[]; positions: readonly FarmTilePosition[] }
  | { kind: 'extension'; extension: FarmyardExtension; terrain: PlayerState['farmTerrain']; positions: readonly FarmTilePosition[] }
  | { kind: 'remove-stables'; positions: readonly FarmTilePosition[] }
  | { kind: 'remove-fences'; indexes: readonly number[]; positions: readonly FarmTilePosition[] }
  | { kind: 'crops'; preparedPlayer: PlayerState; positions: readonly FarmTilePosition[] }
  | { kind: 'rooms'; positions: readonly FarmTilePosition[] }
  | { kind: 'stables'; positions: readonly FarmTilePosition[]; preparedPlayer?: PlayerState }
  | { kind: 'plow'; position: FarmTilePosition; preparedPlayer: PlayerState }
  | { kind: 'fence'; positions: readonly FarmTilePosition[]; preparedPlayer: PlayerState }
  | { kind: 'pastures'; positions: readonly FarmTilePosition[]; pastures: PlayerState['pastures'];
      replacesTerrain?: readonly Pick<FarmTerrainChangedEvent, 'playerId' | 'changes'>[] }
  | { kind: 'terrain'; positions: readonly FarmTilePosition[]; preparedPlayer: PlayerState;
      mode: Extract<FarmOperationResult, { kind: 'terrain' }>['terrainMode']; changes: Extract<FarmOperationResult, { kind: 'terrain' }>['terrainChanges'] }
) & { sourceCardId?: string }

const copyLayout = (player: PlayerState): FarmOperationResult['before'] => ({
  roomTiles: player.roomTiles.map(({ row, col }) => ({ row, col })),
  stableTiles: player.stableTiles.map(({ row, col }) => ({ row, col })),
  fields: player.fields.map(field => ({ ...field, stacks: field.stacks.map(stack => ({ ...stack })) })),
  fenceSegments: player.fenceSegments.map(segment => ({ ...segment, source: segment.source ? { ...segment.source } : undefined })),
  pastures: player.pastures.map(pasture => ({ ...pasture, tiles: pasture.tiles?.map(({ row, col }) => ({ row, col })) })),
  farmyardSpaceStates: (player.farmyardSpaceStates ?? []).map(state => ({ ...state, ...(state.resources ? { resources: { ...state.resources } } : {}), ...(state.crop ? { crop: { ...state.crop } } : {}) })),
  ...(player.farmTerrain ? { farmTerrain: player.farmTerrain.map(tile => ({ ...tile })) } : {}),
  ...(player.farmyardExtensions ? { farmyardExtensions: player.farmyardExtensions.map(extension => ({ ...extension, tiles: extension.tiles.map(({ row, col }) => ({ row, col })) })) } : {}),
})

/** Commit the validated proposal and its payment/animal settlement together.
 * Validators only prepare projections; this is the authoritative layout writer.
 */
const commitPreparedPlayer = (player: PlayerState, prepared: PlayerState): void => {
  for (const key of Object.keys(player) as Array<keyof PlayerState>) {
    if (!(key in prepared)) delete player[key]
  }
  Object.assign(player, prepared)
}

/** The caller owns validation and the completion phase; this operation owns writes.
 * No hooks run here: its receipt stays with the original host's trailing reactions.
 */
export function commitFarmOperation(player: PlayerState, operation: FarmOperation, eventSink?: EventSink): FarmOperationResult {
  const before = copyLayout(player)
  const existingPositions = new Set(getFarmyardTilePositions(player).map(positionKey))
  const previouslyUsed = getUsedFarmyardTileKeys(player)
  if (operation.kind === 'pastures') {
    for (const replacement of operation.replacesTerrain ?? []) {
      if (replacement.playerId !== player.id) continue
      for (const change of replacement.changes) {
        if (change.before && !change.after && !change.fieldCreated) previouslyUsed.add(positionKey(change))
      }
    }
  }
  switch (operation.kind) {
    case 'space-states':
      player.farmyardSpaceStates = operation.states
      break
    case 'extension':
      player.farmyardExtensions = [...(player.farmyardExtensions ?? []), operation.extension]
      if (operation.terrain) player.farmTerrain = operation.terrain
      break
    case 'remove-stables': {
      const removed = new Set(operation.positions.map(positionKey))
      player.stableTiles = player.stableTiles.filter(tile => !removed.has(positionKey(tile)))
      break
    }
    case 'remove-fences':
      player.fenceSegments = player.fenceSegments.filter((_, index) => !operation.indexes.includes(index))
      break
    case 'rooms':
      player.roomTiles = [...player.roomTiles, ...operation.positions.map(({ row, col }) => ({ row, col }))]
      player.rooms += operation.positions.length
      break
    case 'stables':
      if (operation.preparedPlayer) commitPreparedPlayer(player, operation.preparedPlayer)
      player.stableTiles = [...player.stableTiles, ...operation.positions.map(({ row, col }) => ({ row, col }))]
      break
    case 'plow':
    case 'fence':
    case 'terrain':
    case 'crops':
      commitPreparedPlayer(player, operation.preparedPlayer)
      break
    case 'pastures':
      player.pastures = operation.pastures
      break
    default: {
      const exhaustive: never = operation
      return exhaustive
    }
  }
  const result = {
    playerId: player.id,
    ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}),
    positions: (operation.kind === 'plow' ? [operation.position] : operation.positions).map(({ row, col }) => ({ row, col })),
    newlyUsedTiles: getNewlyUsedFarmyardTiles(player, previouslyUsed).filter(tile => existingPositions.has(positionKey(tile))),
    before,
    after: copyLayout(player),
  }
  if (result.newlyUsedTiles.length > 0) eventSink?.emit<'farm.spacesUsed'>({
    type: 'farm.spacesUsed', newlyUsedTiles: result.newlyUsedTiles,
    ...(operation.sourceCardId ? { sourceCardId: operation.sourceCardId } : {}),
  })
  return operation.kind === 'terrain'
    ? { ...result, kind: 'terrain', terrainMode: operation.mode, terrainChanges: operation.changes }
    : { ...result, kind: operation.kind }
}

export function commitFirstAvailableRoom(player: PlayerState, sourceCardId?: string, eventSink?: EventSink): FarmOperationResult | undefined {
  const used = getUsedFarmyardTileKeys(player)
  const position = getFarmyardTilePositions(player).find(tile => !used.has(positionKey(tile)))
  return position ? commitFarmOperation(player, { kind: 'rooms', positions: [position], sourceCardId }, eventSink) : undefined
}

export const addFarmyardSpaceState = (
  player: PlayerState,
  state: FarmyardSpaceState,
  eventSink?: EventSink,
) => {
  const previous = getFarmyardSpaceStates(player).find((entry) =>
    entry.spaceKey === state.spaceKey && entry.kind === state.kind && entry.sourceCardId === state.sourceCardId,
  )
  const next = normalizeFarmyardSpaceStates([
    ...getFarmyardSpaceStates(player).filter((entry) =>
      !(entry.spaceKey === state.spaceKey && entry.kind === state.kind && entry.sourceCardId === state.sourceCardId),
    ),
    state,
  ])
  const tile = parsePositionKey(state.spaceKey)
  const operation = commitFarmOperation(player, { kind: 'space-states', states: next, positions: tile ? [tile] : [], sourceCardId: state.sourceCardId }, eventSink)
  const resources: Partial<Resource> = {}
  for (const resource of Object.keys(state.resources ?? {}) as Array<keyof Resource>) {
    const added = (state.resources?.[resource] ?? 0) - (previous?.resources?.[resource] ?? 0)
    if (added > 0) resources[resource] = added
  }
  if (tile && Object.keys(resources).length > 0) {
    eventSink?.emit<'resource.moved'>({
      type: 'resource.moved', sourceCardId: state.sourceCardId,
      resources, from: { kind: 'supply' },
      to: { kind: 'field', playerId: player.id, ...tile }, reason: 'cardEffect',
    })
  }
  return operation
}


export function addFarmyardExtension(player: PlayerState, sourceCardId: string, tiles: FarmTilePosition[], eventSink?: EventSink, initialTerrain?: FarmTerrainKind): boolean {
  const extension = planFarmyardExtension(player, sourceCardId, tiles)
  if (!extension) return false
  commitFarmOperation(player, { kind: 'extension', extension, positions: extension.tiles, sourceCardId,
    terrain: initialTerrain ? [...(player.farmTerrain ?? []), ...extension.tiles.map(tile => ({ ...tile, kind: initialTerrain }))] : player.farmTerrain,
  }, eventSink)
  return true
}
