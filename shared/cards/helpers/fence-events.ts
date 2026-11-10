import type { CardListenerContext } from '../card-listeners'
import { positionKey } from '../../domain/farmyard-geometry'
import type { FarmyardTileUsage } from '../../contract/events'
import { getActionFarmOperations } from './farmyard-events'

export const hasFenceBuiltEvent = (context: CardListenerContext): boolean =>
  (context.actionEvents ?? context.transactionEvents).some((event) => {
    if (event.type !== 'farm.fenceBuilt') return false
    const fences = (event as { fences?: unknown }).fences
    return Array.isArray(fences) && fences.length > 0
  })

export const hasOrdinaryFenceBuiltEvent = (context: CardListenerContext): boolean =>
  (context.actionEvents ?? context.transactionEvents).some((event) => {
    if (event.type !== 'farm.fenceBuilt') return false
    const edges = (event as { newFenceEdges?: unknown }).newFenceEdges
    return Array.isArray(edges) && edges.length > 0
  })

/** Ordinary fence segments the context player built in the current action. */
export const countNewFenceEdges = (context: CardListenerContext): number => {
  const operations = getActionFarmOperations(context)
  if (operations !== undefined) return operations.reduce((total, operation) => {
    if (operation.kind !== 'fence') return total
    const previous = new Set(operation.before.fenceSegments.map(segment => segment.edge))
    return total + operation.after.fenceSegments.filter(segment => segment.type === 'fence' && !previous.has(segment.edge)).length
  }, 0)
  const builder = context.triggerPlayer ?? context.player
  return (context.actionEvents ?? []).reduce((total, event) => {
    if (!('schemaVersion' in event) || event.type !== 'farm.fenceBuilt'
      || event.actorPlayerId !== builder.id) return total
    return total + (event.newFenceEdges?.length ?? 0)
  }, 0)
}

/** New pasture area committed by this host, independent of the farm owner. */
export const getActionNewlyEnclosedPastureTiles = (context: CardListenerContext): FarmyardTileUsage[] => {
  const operations = getActionFarmOperations(context)
  if (operations !== undefined) return operations.flatMap(operation => {
    if (operation.kind !== 'fence') return []
    const previous = new Set(operation.before.pastures.flatMap(pasture => pasture.tiles ?? []).map(positionKey))
    return operation.after.pastures.flatMap(pasture => pasture.tiles ?? [])
      .filter(tile => !previous.has(positionKey(tile))).map(tile => ({ ...tile, playerId: operation.playerId }))
  })
  const builder = context.triggerPlayer ?? context.player
  return (context.actionEvents ?? []).flatMap(event =>
    'schemaVersion' in event && event.type === 'farm.fenceBuilt' && event.actorPlayerId === builder.id
      ? event.newlyEnclosedPastureTiles : [])
}
