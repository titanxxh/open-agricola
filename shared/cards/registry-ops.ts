/**
 * Registry ops — programmatic helpers for mutating the currently active
 * `CardRegistry`.
 *
 * Use cases:
 *   - Test setup: registering stub listeners / effects for hook coverage
 *     matrices and engine behaviour tests.
 *   - Stub bundles (`shared/cards/__stubs__/`): grouped register / clear
 *     pairs that toggle synthetic listeners around a test.
 *   - Custom-code runtime (`server/custom-code/runtime.ts`): the DSL
 *     exposed to workshop-authored cards literally calls
 *     `registerCardListener` / `registerCardEffect`; the compiler reifies
 *     those calls into real registry writes here.
 *
 * Everything in this module forwards to the active `CardRegistry` — there is
 * no hidden module-level state. Callers must have published an active
 * registry first (`GameCore` does this in its constructor; test setup in
 * `shared/cards/__tests__/setup-register-all.ts` publishes a default one).
 */
import { CardRegistry } from './registry'
import {
  getActiveCardRegistry,
  requireActiveCardRegistry,
  setActiveCardRegistry,
} from './active-registry'
import type { CardListenerRegistration } from './card-listeners'
import type { CardEffect } from './card-effects'

/**
 * Register a card listener against the currently active registry.
 * Listeners without `cardIds` go under a synthetic `__global__` bucket so
 * `getAllListeners()` still returns them.
 */
export const registerCardListener = (registration: CardListenerRegistration) => {
  const active = requireActiveCardRegistry('registerCardListener')
  const cardIds = registration.cardIds && registration.cardIds.length > 0
    ? registration.cardIds
    : ['__global__']
  for (const cardId of cardIds) {
    active.addListener(cardId, registration)
  }
}

/** Register a card effect against the currently active registry. */
export const registerCardEffect = (effect: CardEffect) => {
  const active = requireActiveCardRegistry('registerCardEffect')
  active.setEffect(effect)
}

/** Replace the active registry with a fresh empty one. */
export const clearCardListeners = () => {
  setActiveCardRegistry(new CardRegistry())
}

/** Alias for `clearCardListeners()` — resets both listeners and effects. */
export const clearCardEffects = () => {
  setActiveCardRegistry(new CardRegistry())
}

/** Remove listeners whose id starts with `CUSTOM_` from the active registry. */
export const clearCustomCardListeners = () => {
  const active = getActiveCardRegistry()
  if (!active) return
  active.removeListenersWhere((reg) => reg.id.startsWith('CUSTOM_'))
}

/** Remove effects whose id starts with `CUSTOM_` from the active registry. */
export const clearCustomCardEffects = () => {
  const active = getActiveCardRegistry()
  if (!active) return
  active.removeEffectsWhere((id) => id.startsWith('CUSTOM_'))
}
