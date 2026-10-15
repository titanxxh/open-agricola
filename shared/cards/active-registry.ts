/**
 * Synchronous rule environment selected temporarily by a Session or an explicit
 * rule caller. Sessions own their registries; no process default is published.
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
      `${context}: no active CardRegistry. Run the rule query inside ` +
      `session.withCtx(...) or withActiveRegistry(registry, ...).`,
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
