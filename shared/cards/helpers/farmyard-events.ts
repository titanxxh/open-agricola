import type { FarmyardTileUsage } from '../../contract/events'
import type { CardListenerContext } from '../card-listeners'
import { positionKey } from '../../domain/farmyard-geometry'
import { createEventQuery } from '../../events/query'

/** A returned-flow host keeps its own operation facts, excluding nested children. */
export const getActionTerrainOperations = (context: Pick<CardListenerContext, 'result' | 'actionEvents'>) => {
  const operations = context.result?.type === 'ok' || context.result?.type === 'flow'
    ? context.result.farmOperations : undefined
  if (operations !== undefined) return operations.flatMap(operation => operation.kind === 'terrain'
    ? [{ type: 'farm.terrainChanged' as const, playerId: operation.playerId, operation: operation.terrainMode,
      changes: operation.terrainChanges, newlyUsedTiles: operation.newlyUsedTiles }] : [])
  return createEventQuery(context.actionEvents ?? []).filter('farm.terrainChanged')
}

/** Only this host's committed geometry; nested hosts retain separate scopes. */
export const getActionNewlyUsedTiles = (context: Pick<CardListenerContext, 'actionEvents' | 'player' | 'result'>) => {
  const tiles = new Map<string, FarmyardTileUsage>()
  const operations = context.result?.type === 'ok' || context.result?.type === 'flow' ? context.result.farmOperations : undefined
  if (operations !== undefined) {
    for (const operation of operations) for (const tile of operation.newlyUsedTiles) {
      if (tile.playerId === context.player.id) tiles.set(positionKey(tile), { ...tile })
    }
    return [...tiles.values()]
  }
  for (const event of context.actionEvents ?? []) {
    if (!('schemaVersion' in event)) continue
    if (event.type !== 'farm.spacesUsed') continue
    for (const tile of event.newlyUsedTiles) {
      if (tile.playerId === context.player.id) tiles.set(positionKey(tile), { ...tile })
    }
  }
  return [...tiles.values()]
}
