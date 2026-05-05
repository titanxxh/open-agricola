import { describe, expect, it } from 'vitest'
import { Engine } from '../../engine'

/**
 * S4b PR5 — Engine surface guard.
 *
 * The original Sprint S4 spec §5.4 set a target of 6 public methods on
 * `Engine.prototype`. PR5 audit found that aggressive collapse to 6 is
 * blocked by tight coupling between GameCore (lobby/round/anytime/feed
 * pipelines) and the engine's tree-mutation hooks (`prependFlow`,
 * `injectBeforeNodes`, `injectInteraction`, `insertFlowAfterPendingChoice`,
 * `buildFlowNodePublic`, `hasPendingChoiceCompositeAncestor`,
 * `peekPendingChoiceFromComposite`). Each is exercised from a different
 * GameCore method; relocating them all into a node-class static factory
 * or a new `EngineStack` private helper would inflate this PR past its
 * already-large scope.
 *
 * Pragmatic compromise: this guard locks the *full* runtime surface
 * (TypeScript `private` members still surface via `getOwnPropertyNames`)
 * at PR5 closeout, separated into the documented "public API" set and
 * the "implementation-detail private" set. The guard fails loudly if any
 * future PR re-grows the surface, and lets us re-baseline intentionally
 * when methods get internalized.
 */
describe('Engine surface guard', () => {
  // Canonical public API (what GameCore + tests are allowed to call).
  // Update this list when a method is added/removed *intentionally* and
  // also update spec §5.4.
  const PUBLIC_API = [
    'buildFlowNodePublic',
    'hasPendingChoiceCompositeAncestor',
    'injectBeforeNodes',
    'injectInteraction',
    'insertFlowAfterPendingChoice',
    'peekInteraction',
    'peekInteractionHost',
    'peekNextUnresolved',
    'peekPendingChoiceFromComposite',
    'prependFlow',
    'proceed',
    'resolveChoice',
    'restore',
    'snapshot',
  ]

  // Implementation details that ride on the prototype because TS `private`
  // is a compile-time-only marker. Listed here for completeness so the
  // guard fails when one is accidentally renamed or a new private method
  // is added; it does NOT count toward the public-API surface.
  const PRIVATE_HELPERS = [
    'applyFallbackSourceCardToFlow',
    'applyInteractionRequest',
    'buildActivateCardNodes',
    'buildChoiceExecutionContext',
    'buildFlowNode',
    'buildFollowUpNodes',
    'buildListenerEvent',
    'cloneNode',
    'collectNodeIds',
    'collectOrderedActionNodes',
    'findActionNode',
    'findInteractionNode',
    'findPairedInteractionNode',
    'getActionEffectPreview',
    'getNodeEffectPreview',
    'getSequenceEffectPreview',
    'maybeBuildChoiceCandidates',
    'mergeContextIntoFlow',
    'mergePreviewResources',
    'normalizeFollowUpAction',
    'parseFollowUpAction',
    'resolveSubtree',
    'resolveTrueAction',
    'sanitizePreviewResources',
    'snapshotCompositeEmit',
  ]

  it('public API matches the locked PR5 surface', () => {
    const proto = Engine.prototype
    const ownMethods = Object.getOwnPropertyNames(proto)
      .filter((name) => name !== 'constructor')
      .filter((name) => typeof (proto as unknown as Record<string, unknown>)[name] === 'function')
      .sort()

    const expected = [...PUBLIC_API, ...PRIVATE_HELPERS].sort()
    expect(ownMethods).toEqual(expected)
  })

  it('public API count is bounded (<= 16) — original spec target was 6', () => {
    expect(PUBLIC_API.length).toBeLessThanOrEqual(16)
  })

  it('flags spec §5.4 deferred methods that GameCore still needs', () => {
    const deferredFromSpec = [
      'buildFlowNodePublic',
      'hasPendingChoiceCompositeAncestor',
      'injectBeforeNodes',
      'injectInteraction',
      'insertFlowAfterPendingChoice',
      'peekInteractionHost',
      'peekPendingChoiceFromComposite',
      'prependFlow',
    ]
    const proto = Engine.prototype
    const presentDeferred = deferredFromSpec.filter(
      (name) => typeof (proto as unknown as Record<string, unknown>)[name] === 'function',
    )
    expect(presentDeferred).toEqual(deferredFromSpec)
  })
})
