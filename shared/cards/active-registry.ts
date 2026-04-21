/**
 * Module-scoped reference to the "currently active" CardRegistry.
 *
 * The engine is synchronous, so a single module-level variable is sufficient
 * (no AsyncLocalStorage needed). Every card-lookup / registration helper in
 * `card-listeners.ts` / `card-effects.ts` reads this pointer and operates on
 * the registry it points to.
 *
 * Lifecycle:
 *   - `GameCore` constructor builds a fresh `CardRegistry` loaded with
 *     `ALL_CARD_IMPLS` and publishes it here.
 *   - Test setup (`shared/cards/__tests__/setup-register-all.ts`) publishes a
 *     shared default registry pre-loaded with `ALL_CARD_IMPLS` so any test
 *     that reads listeners/effects without constructing a `GameSession` still
 *     sees every card's implementation.
 *   - Tests that want an empty slate call `clearCardListeners()` /
 *     `clearCardEffects()` which publishes an empty fresh registry.
 */
import { CardRegistry } from './registry'

let active: CardRegistry | null = null

export function setActiveCardRegistry(r: CardRegistry | null): void {
  active = r
}

export function getActiveCardRegistry(): CardRegistry | null {
  return active
}

/** Return the active registry or throw with a helpful message. */
export function requireActiveCardRegistry(context: string): CardRegistry {
  if (!active) {
    throw new Error(
      `${context}: no active CardRegistry. Construct a GameSession, ` +
      `or call setActiveCardRegistry(new CardRegistry()).`,
    )
  }
  return active
}

export function withActiveRegistry<T>(r: CardRegistry, fn: () => T): T {
  const prev = active
  active = r
  try {
    return fn()
  } finally {
    active = prev
  }
}
