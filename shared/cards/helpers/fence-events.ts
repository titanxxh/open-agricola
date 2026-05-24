import type { CardListenerContext } from '../card-listeners'

export const hasFenceBuiltEvent = (context: CardListenerContext): boolean =>
  (context.actionEvents ?? context.transactionEvents).some((event) => {
    if (event.type !== 'farm.fenceBuilt') return false
    const fences = (event as { fences?: unknown }).fences
    return Array.isArray(fences) && fences.length > 0
  })
