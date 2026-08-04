import type { CardListenerRegistration } from './card-listeners'

const sources = new WeakMap<CardListenerRegistration, string>()

export const setCardListenerSource = (
  listener: CardListenerRegistration,
  cardId: string,
): void => {
  sources.set(listener, cardId)
}

export const getCardListenerSource = (
  listener: CardListenerRegistration,
): string | undefined => sources.get(listener)
