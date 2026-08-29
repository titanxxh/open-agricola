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
