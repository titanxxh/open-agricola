import type { PrivateHandChangedEvent } from '../contract/private-events'

export const readPrivateHandChangeSourceCard = (
  actionContext?: Record<string, unknown>,
  changedCardId?: string,
): string | undefined => {
  const sourceCard = actionContext?.privateHandChangeSourceCard
  if (typeof sourceCard !== 'string' || sourceCard.length === 0) return undefined
  if (changedCardId && sourceCard === changedCardId) return undefined
  return sourceCard
}

export const cardEffectHandChangedEvent = (
  recipientPlayerId: string,
  cardIds: string[],
  cardType: PrivateHandChangedEvent['cardType'],
  sourceCard: string,
  sourceActionId?: string,
): PrivateHandChangedEvent => ({
  schemaVersion: 1,
  type: 'private.handChanged',
  recipientPlayerId,
  cardIds,
  cardType,
  reason: 'card-effect',
  sourceCard,
  ...(sourceActionId ? { sourceActionId } : {}),
})
