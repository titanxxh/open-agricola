import type { FarmOperationResult, FarmTilePosition, PlayerState } from '../contract/types'
import type { EventSink, FarmTerrainChangedEvent } from '../contract/events'
import { getFarmyardTilePositions, positionKey } from './farmyard-geometry'
import { getNewlyUsedFarmyardTiles, getUsedFarmyardTileKeys } from './farmyard-usage'

export type FarmOperation = (
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
  roomTiles: player.roomTiles.map(tile => ({ ...tile })),
  stableTiles: player.stableTiles.map(tile => ({ ...tile })),
  fields: player.fields.map(field => ({ ...field, stacks: field.stacks.map(stack => ({ ...stack })) })),
  fenceSegments: player.fenceSegments.map(segment => ({ ...segment, source: segment.source ? { ...segment.source } : undefined })),
  pastures: player.pastures.map(pasture => ({ ...pasture, tiles: pasture.tiles?.map(tile => ({ ...tile })) })),
  ...(player.farmTerrain ? { farmTerrain: player.farmTerrain.map(tile => ({ ...tile })) } : {}),
  ...(player.farmyardExtensions ? { farmyardExtensions: player.farmyardExtensions.map(extension => ({ ...extension, tiles: extension.tiles.map(tile => ({ ...tile })) })) } : {}),
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
    case 'rooms':
      player.roomTiles = [...player.roomTiles, ...operation.positions.map(tile => ({ ...tile }))]
      player.rooms += operation.positions.length
      break
    case 'stables':
      if (operation.preparedPlayer) commitPreparedPlayer(player, operation.preparedPlayer)
      player.stableTiles = [...player.stableTiles, ...operation.positions.map(tile => ({ ...tile }))]
      break
    case 'plow':
    case 'fence':
    case 'terrain':
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
    positions: (operation.kind === 'plow' ? [operation.position] : operation.positions).map(tile => ({ ...tile })),
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
