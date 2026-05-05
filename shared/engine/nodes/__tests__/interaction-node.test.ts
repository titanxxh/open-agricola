import { describe, it, expect } from 'vitest'
import { InteractionNode, getOptionsSourceCard, resolveChoiceSourceCard } from '../interaction-node'
import type { EngineContext } from '../../types'
import type { ActionChoiceOption } from '../../../game/types'

const stubCtx: EngineContext = { resolveSubtree: () => {}, emitChoice: () => {} }

describe('InteractionNode.step', () => {
  it('returns blocked when no choices have been emitted', () => {
    const node = new InteractionNode('i1', [])
    expect(node.step(stubCtx)).toEqual({ kind: 'blocked', reason: 'no choices' })
  })

  it('returns choice when choices have been emitted via setChoice', () => {
    const node = new InteractionNode('i1', [])
    node.setChoice('ui.test', [{ value: 'x', labelKey: 'x' }])
    expect(node.step(stubCtx)).toEqual({ kind: 'choice', nodeId: 'i1' })
  })

  it('returns choice when has choices regardless of state (pre-PR3 semantic)', () => {
    // step() must NOT inspect nodeState — pre-PR3 the `instanceof
    // InteractionNode` dispatch in Engine.proceed only branched on
    // `choices.length > 0`. Resolved-but-still-presented nodes are filtered
    // by `nextUnresolved()` before reaching step(); on rare paths where a
    // resolved node still hits step (e.g. improvement-pay-fail-idempotent
    // mid-flow re-entry), the choice surface must remain so the player can
    // still respond.
    const node = new InteractionNode('i1', [{ value: 'x', labelKey: 'x' }])
    node.setState('resolved')
    expect(node.step(stubCtx)).toEqual({ kind: 'choice', nodeId: 'i1' })
  })
})

describe('InteractionNode.validateSelection', () => {
  it('returns true for a value present in choices', () => {
    const node = new InteractionNode('i1', [
      { value: 'a', labelKey: 'a' },
      { value: 'b', labelKey: 'b' },
    ])
    expect(node.validateSelection('a')).toBe(true)
    expect(node.validateSelection('b')).toBe(true)
  })

  it('returns false for a value not in choices', () => {
    const node = new InteractionNode('i1', [{ value: 'a', labelKey: 'a' }])
    expect(node.validateSelection('z')).toBe(false)
  })

  it('returns false for an empty choices list', () => {
    const node = new InteractionNode('i1', [])
    expect(node.validateSelection('anything')).toBe(false)
  })
})

describe('InteractionNode.resolve', () => {
  it('blocks the node when the value is unknown', () => {
    const node = new InteractionNode('i1', [{ value: 'a', labelKey: 'a' }])
    node.resolve('not-a-real-value')
    expect(node.getState()).toBe('blocked')
  })

  it('marks resolved when the value matches', () => {
    const node = new InteractionNode('i1', [{ value: 'a', labelKey: 'a' }])
    node.resolve('a')
    expect(node.getState()).toBe('resolved')
  })
})

describe('InteractionNode.emit', () => {
  it('mirrors setChoice + request + pendingActionId + ownerNodeId + contextSnapshot', () => {
    const node = new InteractionNode('i1', [])
    const snapshot = node.emit({
      request: { kind: 'choice', options: [{ value: 'x', labelKey: 'x' }] },
      promptKey: 'ui.foo',
      choiceOptions: [{ value: 'x', labelKey: 'x' }],
      actionId: 'plow',
      ownerNodeId: 'xor-1',
      params: { foo: 1 },
      costs: { wood: 2 },
      sourceCard: 'A123',
      actionContext: { trueAction: false },
    })
    expect(node.choices).toEqual([{ value: 'x', labelKey: 'x' }])
    expect(node.promptKey).toBe('ui.foo')
    expect(node.request).toEqual({
      kind: 'choice',
      options: [{ value: 'x', labelKey: 'x' }],
    })
    expect(node.pendingActionId).toBe('plow')
    expect(node.ownerNodeId).toBe('xor-1')
    expect(node.contextSnapshot).toEqual({
      params: { foo: 1 },
      costs: { wood: 2 },
      sourceCard: 'A123',
      actionContext: { trueAction: false },
    })
    expect(snapshot).toEqual(node.contextSnapshot)
  })

  it('honours preserveOwner — keeps existing ownerNodeId', () => {
    const node = new InteractionNode('i1', [])
    node.ownerNodeId = 'xor-original'
    node.emit({
      request: { kind: 'choice', options: [{ value: 'a', labelKey: 'a' }] },
      choiceOptions: [{ value: 'a', labelKey: 'a' }],
      actionId: 'gain',
      ownerNodeId: 'xor-new',
      params: undefined,
      costs: undefined,
      sourceCard: undefined,
      actionContext: undefined,
      preserveOwner: true,
    })
    expect(node.ownerNodeId).toBe('xor-original')
  })

  it('shallow-merges contextWritePatch into actionContext', () => {
    const node = new InteractionNode('i1', [])
    const snapshot = node.emit({
      request: { kind: 'choice', options: [] },
      choiceOptions: [],
      actionId: 'foo',
      ownerNodeId: null,
      params: undefined,
      costs: undefined,
      sourceCard: undefined,
      actionContext: { existing: 1 },
      contextWritePatch: { fresh: 2 },
    })
    expect(snapshot.actionContext).toEqual({ existing: 1, fresh: 2 })
  })

  it('falls back to options-derived sourceCard when no explicit value passed', () => {
    const node = new InteractionNode('i1', [])
    const snapshot = node.emit({
      request: { kind: 'choice', options: [] },
      choiceOptions: [
        { value: 'a', labelKey: 'a', sourceCard: 'A100' },
        { value: 'b', labelKey: 'b', sourceCard: 'A100' },
      ],
      actionId: 'foo',
      ownerNodeId: null,
      params: undefined,
      costs: undefined,
      sourceCard: undefined,
      actionContext: undefined,
    })
    expect(snapshot.sourceCard).toBe('A100')
  })
})

describe('InteractionNode.toCursor', () => {
  it('serialises all interaction-relevant fields', () => {
    const node = new InteractionNode('i1', [{ value: 'x', labelKey: 'x' }], {
      kind: 'choice',
      options: [{ value: 'x', labelKey: 'x' }],
    })
    node.setChoice('ui.foo', [{ value: 'x', labelKey: 'x' }], { qty: 3 })
    node.pendingActionId = 'gain'
    node.ownerNodeId = 'xor-1'
    node.contextSnapshot = {
      params: undefined,
      costs: undefined,
      sourceCard: 'A1',
      actionContext: undefined,
    }
    const cursor = node.toCursor()
    expect(cursor.type).toBe('interaction')
    expect(cursor.id).toBe('i1')
    expect(cursor.data.choices).toEqual([{ value: 'x', labelKey: 'x' }])
    expect(cursor.data.promptKey).toBe('ui.foo')
    expect(cursor.data.promptParams).toEqual({ qty: 3 })
    expect(cursor.data.pendingActionId).toBe('gain')
    expect(cursor.data.ownerNodeId).toBe('xor-1')
    expect((cursor.data.contextSnapshot as Record<string, unknown>).sourceCard).toBe('A1')
  })
})

describe('getOptionsSourceCard / resolveChoiceSourceCard helpers', () => {
  const opts = (cards: (string | undefined)[]): ActionChoiceOption[] =>
    cards.map((sc, i) => ({ value: `v${i}`, labelKey: 'k', sourceCard: sc }))

  it('getOptionsSourceCard returns the unique sourceCard when all options agree', () => {
    expect(getOptionsSourceCard(opts(['A1', 'A1', 'A1']))).toBe('A1')
  })

  it('getOptionsSourceCard returns undefined for mixed sourceCards', () => {
    expect(getOptionsSourceCard(opts(['A1', 'A2']))).toBeUndefined()
  })

  it('getOptionsSourceCard returns undefined when any option is missing sourceCard', () => {
    expect(getOptionsSourceCard(opts(['A1', undefined]))).toBeUndefined()
  })

  it('getOptionsSourceCard returns undefined for empty list', () => {
    expect(getOptionsSourceCard([])).toBeUndefined()
  })

  it('resolveChoiceSourceCard prefers explicit value', () => {
    expect(resolveChoiceSourceCard('B7', opts(['A1', 'A1']))).toBe('B7')
  })

  it('resolveChoiceSourceCard falls back to options when explicit is undefined', () => {
    expect(resolveChoiceSourceCard(undefined, opts(['A1', 'A1']))).toBe('A1')
  })
})
