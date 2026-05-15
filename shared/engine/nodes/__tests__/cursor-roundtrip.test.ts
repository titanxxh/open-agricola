import { describe, expect, it } from 'vitest'
import { ActionNode } from '../action-node'
import { OrNode } from '../or-node'
import { ParallelNode } from '../parallel-node'
import { SequenceNode } from '../sequence-node'
import { XorNode } from '../xor-node'

/**
 * S4b PR5 — cursor round-trip guards (one per runtime node type).
 *
 * Each test:
 *   1. constructs a fresh node with realistic field values + state
 *   2. captures `toCursor()` (snapshot 1)
 *   3. constructs an equivalent node from the cursor data and re-captures
 *      `toCursor()` (snapshot 2)
 *   4. asserts the two snapshots are deeply equal
 *
 * No `fromCursor()` exists today — restoration is wired through the engine
 * snapshot/restore pipeline. These tests validate the *cursor data shape* by
 * manually rebuilding a sibling node from the cursor's `data` payload, which
 * is what a future `fromCursor()` factory would do automatically.
 */
describe('cursor round-trip', () => {
  it('BaseNode cursor data includes shared metadata and pending envelope', () => {
    const node = new ActionNode('a-pending', 'gain-wood')
    node.ownerPlayerId = 'p2'
    node.optional = true
    node.optionalActive = false
    node.optionalPromptKey = 'ui.interactionOptionalAction'
    node.pending = {
      hostNodeId: node.id,
      request: { kind: 'choice', options: [{ value: 'yes', labelKey: 'ui.yes' }] },
      choices: [{ value: 'yes', labelKey: 'ui.yes' }],
      promptKey: 'ui.interactionOptionalAction',
      effectiveOwnerPlayerId: 'p2',
      syntheticKind: 'interaction-only',
    }

    expect(node.toCursor().data).toMatchObject({
      ownerPlayerId: 'p2',
      optional: true,
      optionalActive: false,
      optionalPromptKey: 'ui.interactionOptionalAction',
      pending: {
        hostNodeId: 'a-pending',
        request: { kind: 'choice', options: [{ value: 'yes', labelKey: 'ui.yes' }] },
        choices: [{ value: 'yes', labelKey: 'ui.yes' }],
        promptKey: 'ui.interactionOptionalAction',
        effectiveOwnerPlayerId: 'p2',
        syntheticKind: 'interaction-only',
      },
    })
  })

  it('ActionNode preserves all fields through toCursor', () => {
    const original = new ActionNode(
      'a-1',
      'gain-wood',
      'D123_FooCard',
      { wood: 2 },
      'ui.label.foo',
      { p: 1 },
      { trigger: 'anytime' },
      { kind: 'gain', resources: { wood: 2 } } as never,
    )
    original.beforePhaseResolved = true
    const c1 = original.toCursor()
    const rebuilt = new ActionNode(
      c1.id,
      (c1.data.actionId as string),
      c1.data.sourceCard as string | undefined,
      c1.data.params as never,
      c1.data.choiceLabelKey as string | undefined,
      c1.data.choiceLabelParams as Record<string, unknown> | undefined,
      c1.data.actionContext as Record<string, unknown> | undefined,
      c1.data.effectPreview as never,
    )
    rebuilt.beforePhaseResolved = c1.data.beforePhaseResolved as boolean
    rebuilt.setState(c1.state)
    expect(rebuilt.toCursor()).toEqual(c1)
  })

  it('SequenceNode preserves childrenIds through toCursor', () => {
    const a = new ActionNode('seq-child-a', 'gain-wood')
    const b = new ActionNode('seq-child-b', 'gain-clay')
    const original = new SequenceNode('seq-1', [a, b])
    const c1 = original.toCursor()
    // Rebuild needs the same children references (identity by id is the
    // round-trip contract; sequenceNode does not own its children's data).
    const rebuilt = new SequenceNode(c1.id, [a, b])
    rebuilt.setState(c1.state)
    expect(rebuilt.toCursor()).toEqual(c1)
  })

  it('ParallelNode preserves childrenIds through toCursor', () => {
    const a = new ActionNode('par-child-a', 'gain-wood')
    const b = new ActionNode('par-child-b', 'gain-clay')
    const original = new ParallelNode('par-1', [a, b])
    const c1 = original.toCursor()
    const rebuilt = new ParallelNode(c1.id, [a, b])
    rebuilt.setState(c1.state)
    expect(rebuilt.toCursor()).toEqual(c1)
  })

  it('OrNode preserves emit metadata + pending context through toCursor', () => {
    const a = new ActionNode('or-child-a', 'gain-wood')
    const b = new ActionNode('or-child-b', 'gain-clay')
    const original = new OrNode('or-1', [a, b], 'ui.test.or')
    original.emittedChoices = [{ value: 'a', labelKey: 'ui.or.a' }]
    original.emittedPromptKey = 'ui.test.or-emit'
    original.emittedPromptParams = { p: 1 }
    original.pendingActionId = null
    original.pendingContextSnapshot = {
      params: undefined,
      costs: undefined,
      sourceCard: 'D7_X',
      actionContext: undefined,
    }
    const c1 = original.toCursor()
    const rebuilt = new OrNode(c1.id, [a, b], c1.data.promptKey as never)
    rebuilt.emittedChoices = c1.data.emittedChoices as never
    rebuilt.emittedPromptKey = c1.data.emittedPromptKey as never
    rebuilt.emittedPromptParams = c1.data.emittedPromptParams as never
    rebuilt.emittedRequest = c1.data.emittedRequest as never
    rebuilt.pendingActionId = c1.data.pendingActionId as string | null | undefined
    rebuilt.pendingContextSnapshot = c1.data.pendingContextSnapshot as never
    rebuilt.setState(c1.state)
    expect(rebuilt.toCursor()).toEqual(c1)
  })

  it('XorNode preserves emit metadata + pending context through toCursor', () => {
    const a = new ActionNode('xor-child-a', 'gain-wood')
    const b = new ActionNode('xor-child-b', 'gain-clay')
    const original = new XorNode('xor-1', [a, b], 'ui.test.xor')
    original.emittedChoices = [{ value: 'b', labelKey: 'ui.xor.b' }]
    original.emittedPromptKey = 'ui.test.xor-emit'
    original.pendingActionId = null
    original.pendingContextSnapshot = {
      params: undefined,
      costs: undefined,
      sourceCard: undefined,
      actionContext: undefined,
    }
    const c1 = original.toCursor()
    const rebuilt = new XorNode(c1.id, [a, b], c1.data.promptKey as never)
    rebuilt.emittedChoices = c1.data.emittedChoices as never
    rebuilt.emittedPromptKey = c1.data.emittedPromptKey as never
    rebuilt.emittedPromptParams = c1.data.emittedPromptParams as never
    rebuilt.emittedRequest = c1.data.emittedRequest as never
    rebuilt.pendingActionId = c1.data.pendingActionId as string | null | undefined
    rebuilt.pendingContextSnapshot = c1.data.pendingContextSnapshot as never
    rebuilt.setState(c1.state)
    expect(rebuilt.toCursor()).toEqual(c1)
  })

  it('ActionNode preserves optional metadata through toCursor', () => {
    const original = new ActionNode('opt-action', 'gain-wood')
    original.optional = true
    original.optionalActive = true
    original.optionalPromptKey = 'ui.test.opt'
    const c1 = original.toCursor()
    const rebuilt = new ActionNode(c1.id, c1.data.actionId as string)
    rebuilt.optional = c1.data.optional as boolean
    rebuilt.optionalActive = c1.data.optionalActive as boolean
    rebuilt.optionalPromptKey = c1.data.optionalPromptKey as never
    rebuilt.setState(c1.state)
    expect(rebuilt.toCursor()).toEqual(c1)
  })

  it('ActionNode preserves mandatory metadata through toCursor', () => {
    const original = new ActionNode('mandatory-action', 'gain-wood')
    original.mandatory = true
    const c1 = original.toCursor()
    const rebuilt = new ActionNode(c1.id, c1.data.actionId as string)
    rebuilt.mandatory = c1.data.mandatory as boolean
    rebuilt.setState(c1.state)
    expect(rebuilt.toCursor()).toEqual(c1)
  })
})
