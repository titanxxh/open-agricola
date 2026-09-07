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
import type { CardDefinition } from '../contract/cards'
import type { ComplexCost, CostModifier, GameState, PaymentResourceMap, PlayerState } from '../contract/types'
import { setCardListenerSource } from './card-listener-source'

export type PrerequisiteHandler = (player: PlayerState, state?: GameState) => boolean
export type CardPurchaseBaseCostContext = {
  state: GameState
  player: PlayerState
  cardId: string
  actionId: 'improvement'
  actionCardId?: string
}
export type CardPurchaseBaseCostHandler = (
  context: CardPurchaseBaseCostContext,
) => PaymentResourceMap | PaymentResourceMap[] | ComplexCost | null | undefined

export type CardImpl = {
  listeners?: CardListenerRegistration[]
  effect?: CardEffect
  modifiers?: CostModifier[]
  prerequisiteCheck?: PrerequisiteHandler
  getBaseCosts?: CardPurchaseBaseCostHandler
  reaches?: readonly string[]
}

type CardRegistryLoadOptions = {
  protected?: boolean
}

export type RegistrySnapshot = {
  cardIds: string[]
  listenerCount: number
  effectCount: number
  modifierCount: number
  prereqCheckCount: number
}

export class CardRegistry {
  private readonly listenersByCard = new Map<string, CardListenerRegistration[]>()
  private listenersWithoutCardIds: CardListenerRegistration[] | null = null
  private readonly effectsByCard = new Map<string, CardEffect>()
  private readonly modifiersByCard = new Map<string, CostModifier[]>()
  private readonly prereqChecksByCard = new Map<string, PrerequisiteHandler>()
  private readonly baseCostHandlersByCard = new Map<string, CardPurchaseBaseCostHandler>()
  private readonly protectedListenerIds = new Set<string>()
  private readonly protectedEffectIds = new Set<string>()

  loadImpl(cardId: string, impl: CardImpl, options: CardRegistryLoadOptions = {}): void {
    if (impl.listeners && impl.listeners.length > 0) {
      for (const listener of impl.listeners) setCardListenerSource(listener, cardId)
      this.listenersByCard.set(cardId, impl.listeners)
      this.listenersWithoutCardIds = null
      if (options.protected) {
        for (const listener of impl.listeners) this.protectedListenerIds.add(listener.id)
      }
    }
    if (impl.effect) {
      this.effectsByCard.set(cardId, impl.effect)
      if (options.protected) this.protectedEffectIds.add(cardId)
    }
    if (impl.modifiers && impl.modifiers.length > 0) {
      this.modifiersByCard.set(cardId, impl.modifiers)
    }
    if (impl.prerequisiteCheck) {
      this.prereqChecksByCard.set(cardId, impl.prerequisiteCheck)
    }
    if (impl.getBaseCosts) {
      this.baseCostHandlersByCard.set(cardId, impl.getBaseCosts)
    }
  }

  /** Append a single listener to a card, preserving existing ones; dedupes by id. */
  addListener(cardId: string, listener: CardListenerRegistration): void {
    const existing = this.listenersByCard.get(cardId) ?? []
    const filtered = existing.filter((l) => l.id !== listener.id)
    filtered.push(listener)
    this.listenersByCard.set(cardId, filtered)
    this.listenersWithoutCardIds = null
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
      const kept = listeners.filter((l) => this.protectedListenerIds.has(l.id) || !predicate(l))
      if (kept.length === 0) {
        this.listenersByCard.delete(cardId)
      } else if (kept.length !== listeners.length) {
        this.listenersByCard.set(cardId, kept)
      }
    }
    this.listenersWithoutCardIds = null
  }

  /** Remove effects matching a predicate. */
  removeEffectsWhere(predicate: (id: string) => boolean): void {
    for (const id of [...this.effectsByCard.keys()]) {
      if (!this.protectedEffectIds.has(id) && predicate(id)) this.effectsByCard.delete(id)
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

  syncModifiersFromCatalog(
    _occupations: readonly CardDefinition[],
    _minors: readonly CardDefinition[],
  ): void {
  }

  /**
   * Register card effect bundles into the registry. Used to load majors
   * (CardDefinition + CardEffect intersection) so getEffect resolves them
   * after the legacy `getMajorCardEffect` fallback in card-effects.ts is
   * removed. Each entry that has at least one CardEffect hook (anything
   * besides id) is set as the effect for `entry.id`.
   */
  registerEffects(effects: readonly CardEffect[], options: CardRegistryLoadOptions = {}): void {
    for (const effect of effects) {
      if (this.effectsByCard.has(effect.id)) continue
      this.effectsByCard.set(effect.id, effect)
      if (options.protected) this.protectedEffectIds.add(effect.id)
    }
  }

  /** Shallow clone: new CardRegistry with the same listener / effect / modifier entries. */
  clone(): CardRegistry {
    const copy = new CardRegistry()
    copy.mergeFrom(this)
    return copy
  }

  mergeFrom(other: CardRegistry): void {
    for (const [cardId, listeners] of other.listenersByCard) {
      this.listenersByCard.set(cardId, [...listeners])
    }
    this.listenersWithoutCardIds = null
    for (const [cardId, effect] of other.effectsByCard) {
      this.effectsByCard.set(cardId, effect)
    }
    for (const [cardId, modifiers] of other.modifiersByCard) {
      this.modifiersByCard.set(cardId, [...modifiers])
    }
    for (const [cardId, fn] of other.prereqChecksByCard) {
      this.prereqChecksByCard.set(cardId, fn)
    }
    for (const [cardId, fn] of other.baseCostHandlersByCard) {
      this.baseCostHandlersByCard.set(cardId, fn)
    }
    for (const id of other.protectedListenerIds) this.protectedListenerIds.add(id)
    for (const id of other.protectedEffectIds) this.protectedEffectIds.add(id)
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
    const listeners = this.listenersByCard.get(cardId) ?? []
    for (const listener of listeners) this.protectedListenerIds.delete(listener.id)
    this.listenersByCard.delete(cardId)
    this.listenersWithoutCardIds = null
    this.effectsByCard.delete(cardId)
    this.protectedEffectIds.delete(cardId)
    this.modifiersByCard.delete(cardId)
    this.prereqChecksByCard.delete(cardId)
    this.baseCostHandlersByCard.delete(cardId)
  }

  getListenersFor(cardId: string): CardListenerRegistration[] {
    return this.listenersByCard.get(cardId) ?? []
  }

  getCandidateListeners(cardIds: Iterable<string>): CardListenerRegistration[] {
    this.listenersWithoutCardIds ??= this.getAllListeners().filter(
      (listener) => !listener.cardIds?.length,
    )
    const result: CardListenerRegistration[] = []
    const seen = new Set<CardListenerRegistration>()
    const append = (listener: CardListenerRegistration) => {
      if (seen.has(listener)) return
      seen.add(listener)
      result.push(listener)
    }
    this.listenersWithoutCardIds.forEach(append)
    new Set(cardIds).forEach((cardId) => this.getListenersFor(cardId).forEach(append))
    return result
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
      this.modifiersByCard.has(cardId) ||
      this.prereqChecksByCard.has(cardId) ||
      this.baseCostHandlersByCard.has(cardId)
    )
  }

  getPrerequisiteCheck(cardId: string): PrerequisiteHandler | undefined {
    return this.prereqChecksByCard.get(cardId)
  }

  getBaseCosts(cardId: string): CardPurchaseBaseCostHandler | undefined {
    return this.baseCostHandlersByCard.get(cardId)
  }

  snapshot(): RegistrySnapshot {
    const cardIds = new Set<string>([
      ...this.listenersByCard.keys(),
      ...this.effectsByCard.keys(),
      ...this.modifiersByCard.keys(),
      ...this.prereqChecksByCard.keys(),
      ...this.baseCostHandlersByCard.keys(),
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
      prereqCheckCount: this.prereqChecksByCard.size,
    }
  }
}
