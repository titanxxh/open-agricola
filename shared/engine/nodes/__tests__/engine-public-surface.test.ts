import { describe, expect, it } from 'vitest'
import { Engine } from '../../engine'

/**
 * S4c — Engine surface guard (target: 6 public methods).
 *
 * PR1 sets the target. Tests fail until PR4+PR5 internalize the 8 methods.
 * Update PUBLIC_API here when methods are intentionally added/removed.
 * Update PRIVATE_HELPERS when private implementation methods change.
 */
describe('Engine surface guard', () => {
  const PUBLIC_API = [
    'injectBeforeFlows',
    'injectInteraction',
    'proceed',
    'resolveChoice',
    'restore',
    'snapshot',
  ]

  // Implementation-detail methods that live on the prototype because TS `private`
  // is compile-time only. Listed here so the guard fails loudly on accidental rename
  // or new private addition. Does NOT count toward public-API surface.
  const PRIVATE_HELPERS = [
    '_internals',
    'hasPendingChoiceCompositeAncestor',
    'insertFlowAfterPendingChoice',
    'peekInteraction',
    'peekInteractionHost',
    'peekPendingEnvelope',
    'peekPendingChoiceFromComposite',
    'peekPendingHost',
  ]

  it('public API matches the S4c target surface (6 methods)', () => {
    const proto = Engine.prototype
    const ownMethods = Object.getOwnPropertyNames(proto)
      .filter((name) => name !== 'constructor')
      .filter((name) => typeof (proto as unknown as Record<string, unknown>)[name] === 'function')
      .sort()

    const expected = [...PUBLIC_API, ...PRIVATE_HELPERS].sort()
    expect(ownMethods).toEqual(expected)
  })

  it('public API count is exactly 6', () => {
    expect(PUBLIC_API.length).toBe(6)
  })
})
