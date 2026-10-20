import type { CardListenerContext } from '../card-listeners'

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
export const countNewFenceEdges = (context: CardListenerContext): number =>
  (context.actionEvents ?? []).reduce((total, event) => {
    if (!('schemaVersion' in event) || event.type !== 'farm.fenceBuilt'
      || (event.targetPlayerId ?? event.actorPlayerId) !== context.player.id) return total
    return total + (event.newFenceEdges?.length ?? 0)
  }, 0)
