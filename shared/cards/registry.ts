/**
 * CardRegistry — per-session, injectable card registration container.
 *
 * Replaces the current module-level global registries in `card-listeners.ts` /
 * `card-effects.ts` / `card-modifiers.ts`. PR-1 creates the class; PR-2 wires
 * GameCore to use it; PR-3 deletes the legacy global layer.
 *
 * Design:
 * - Each session (multiplayer room or local sandbox) owns one registry
 * - `loadImpl(cardId, impl)` is called when a card is added to the pool
 * - `unload(cardId)` is called when a room closes to free references
 * - Getters are read-only queries the engine uses during `step()`
 */
import type { CardListenerRegistration } from './card-listeners'
import type { CardEffect } from './card-effects'

export type TradeLikeModifier = {
  type: string
  cardId: string
  [key: string]: unknown
}

export type CardImpl = {
  listeners?: CardListenerRegistration[]
  effect?: CardEffect
  modifiers?: TradeLikeModifier[]
  reaches?: readonly string[]
}

export type RegistrySnapshot = {
  cardIds: string[]
  listenerCount: number
  effectCount: number
  modifierCount: number
}

export class CardRegistry {
  private readonly listenersByCard = new Map<string, CardListenerRegistration[]>()
  private readonly effectsByCard = new Map<string, CardEffect>()
  private readonly modifiersByCard = new Map<string, TradeLikeModifier[]>()

  loadImpl(cardId: string, impl: CardImpl): void {
    if (impl.listeners && impl.listeners.length > 0) {
      this.listenersByCard.set(cardId, impl.listeners)
    }
    if (impl.effect) {
      this.effectsByCard.set(cardId, impl.effect)
    }
    if (impl.modifiers && impl.modifiers.length > 0) {
      this.modifiersByCard.set(cardId, impl.modifiers)
    }
  }

  unload(cardId: string): void {
    this.listenersByCard.delete(cardId)
    this.effectsByCard.delete(cardId)
    this.modifiersByCard.delete(cardId)
  }

  getListenersFor(cardId: string): CardListenerRegistration[] {
    return this.listenersByCard.get(cardId) ?? []
  }

  getAllListeners(): CardListenerRegistration[] {
    return Array.from(this.listenersByCard.values()).flat()
  }

  getEffect(cardId: string): CardEffect | undefined {
    return this.effectsByCard.get(cardId)
  }

  getModifiers(cardId: string): TradeLikeModifier[] {
    return this.modifiersByCard.get(cardId) ?? []
  }

  hasCard(cardId: string): boolean {
    return (
      this.listenersByCard.has(cardId) ||
      this.effectsByCard.has(cardId) ||
      this.modifiersByCard.has(cardId)
    )
  }

  snapshot(): RegistrySnapshot {
    const cardIds = new Set<string>([
      ...this.listenersByCard.keys(),
      ...this.effectsByCard.keys(),
      ...this.modifiersByCard.keys(),
    ])
    return {
      cardIds: Array.from(cardIds),
      listenerCount: Array.from(this.listenersByCard.values()).reduce(
        (a, l) => a + l.length,
        0,
      ),
      effectCount: this.effectsByCard.size,
      modifierCount: Array.from(this.modifiersByCard.values()).reduce(
        (a, m) => a + m.length,
        0,
      ),
    }
  }
}
