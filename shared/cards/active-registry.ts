/**
 * Thread-local (module-scoped) reference to the "currently active" CardRegistry.
 *
 * Global registry functions (`registerCardListener`, `registerCardEffect`,
 * `registerCardModifier`) delegate to the active registry when one is set, else
 * fall back to the legacy module-level Maps.
 *
 * Used during PR-2 migration so that:
 *   - Cards restructured to `_impl` shape register into a per-session CardRegistry
 *   - Unmigrated cards still use legacy global path until their file is updated
 *
 * Removed in PR-3 once all cards are migrated.
 */
import type { CardRegistry } from './registry'

let active: CardRegistry | null = null

export function setActiveCardRegistry(r: CardRegistry | null): void {
  active = r
}

export function getActiveCardRegistry(): CardRegistry | null {
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
