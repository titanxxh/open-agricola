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
import type { CardDefinition } from './types'
import type { CostModifier } from '../game/types'

export type CardImpl = {
  listeners?: CardListenerRegistration[]
  effect?: CardEffect
  modifiers?: CostModifier[]
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
  private readonly modifiersByCard = new Map<string, CostModifier[]>()

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

  /** Append a single listener to a card, preserving existing ones; dedupes by id. */
  addListener(cardId: string, listener: CardListenerRegistration): void {
    const existing = this.listenersByCard.get(cardId) ?? []
    const filtered = existing.filter((l) => l.id !== listener.id)
    filtered.push(listener)
    this.listenersByCard.set(cardId, filtered)
  }

  /**
   * Register a listener using its own `cardIds`. Listeners without explicit
   * `cardIds` go under the synthetic `__global__` bucket so `getAllListeners()`
   * still returns them.
   */
  registerListener(listener: CardListenerRegistration): void {
    const ids = listener.cardIds && listener.cardIds.length > 0
      ? listener.cardIds
      : ['__global__']
    for (const id of ids) this.addListener(id, listener)
  }

  /** Set or replace the effect keyed by its id. */
  setEffect(effect: CardEffect): void {
    this.effectsByCard.set(effect.id, effect)
  }

  /** Remove listeners matching a predicate across all cards. */
  removeListenersWhere(predicate: (reg: CardListenerRegistration) => boolean): void {
    for (const [cardId, listeners] of this.listenersByCard) {
      const kept = listeners.filter((l) => !predicate(l))
      if (kept.length === 0) {
        this.listenersByCard.delete(cardId)
      } else if (kept.length !== listeners.length) {
        this.listenersByCard.set(cardId, kept)
      }
    }
  }

  /** Remove effects matching a predicate. */
  removeEffectsWhere(predicate: (id: string) => boolean): void {
    for (const id of [...this.effectsByCard.keys()]) {
      if (predicate(id)) this.effectsByCard.delete(id)
    }
  }

  /** Set or replace the modifier list keyed by cardId. Empty list deletes. */
  setModifiersForCard(cardId: string, modifiers: CostModifier[]): void {
    if (modifiers.length > 0) {
      this.modifiersByCard.set(cardId, modifiers)
    } else {
      this.modifiersByCard.delete(cardId)
    }
  }

  /**
   * Populate modifiersByCard from catalog card definitions. Reads
   * `card.modifier` (singular) and `card.modifiers` (plural) fields and
   * merges them. Majors don't carry modifier fields, so callers should
   * pass occupation + minor arrays only.
   *
   * Called once per session by GameCore after loadByIds; replaces the old
   * card-modifiers.ts catalog-direct-query path.
   */
  syncModifiersFromCatalog(
    occupations: readonly CardDefinition[],
    minors: readonly CardDefinition[],
  ): void {
    for (const card of [...occupations, ...minors]) {
      const mods: CostModifier[] = [
        ...(card.modifiers ?? []),
        ...(card.modifier ? [card.modifier] : []),
      ]
      if (mods.length > 0) {
        this.modifiersByCard.set(card.id, mods)
      }
    }
  }

  /**
   * Register card effect bundles into the registry. Used to load majors
   * (CardDefinition + CardEffect intersection) so getEffect resolves them
   * after the legacy `getMajorCardEffect` fallback in card-effects.ts is
   * removed. Each entry that has at least one CardEffect hook (anything
   * besides id) is set as the effect for `entry.id`.
   */
  registerEffects(effects: readonly CardEffect[]): void {
    for (const effect of effects) {
      this.effectsByCard.set(effect.id, effect)
    }
  }

  /** Shallow clone: new CardRegistry with the same listener / effect / modifier entries. */
  clone(): CardRegistry {
    const copy = new CardRegistry()
    for (const [cardId, listeners] of this.listenersByCard) {
      copy.listenersByCard.set(cardId, [...listeners])
    }
    for (const [cardId, effect] of this.effectsByCard) {
      copy.effectsByCard.set(cardId, effect)
    }
    for (const [cardId, modifiers] of this.modifiersByCard) {
      copy.modifiersByCard.set(cardId, [...modifiers])
    }
    return copy
  }

  /**
   * Batch-load multiple cards through a lookup function. Intended for the
   * draft lifecycle: after players finalize their card pool, the server
   * walks the picked ids and loads only those impls. Unknown ids (lookup
   * returns undefined) are skipped silently so callers can pass the raw
   * pool without pre-filtering.
   */
  loadByIds(ids: string[], lookup: (id: string) => CardImpl | undefined): void {
    for (const id of ids) {
      const impl = lookup(id)
      if (impl) {
        this.loadImpl(id, impl)
      }
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

  getModifiers(cardId: string): CostModifier[] {
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
