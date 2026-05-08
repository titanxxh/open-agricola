import { describe, it, expect, vi } from 'vitest'
import { EngineStack, type EngineFrame } from '../engine-stack'
import { Engine } from '../engine'
import { EngineTree } from '../tree'
import { ActionRegistry } from '../registry'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import { ActionNode } from '../nodes'

const makeEngine = () =>
  new Engine({
    tree: new EngineTree(new ActionNode('action-noop', 'noop')),
    registry: new ActionRegistry(),
    hooks: new HookDispatcher(),
    log: new LogStore(),
  })

const makeFrame = (overrides: Partial<EngineFrame> = {}): EngineFrame => ({
  engine: makeEngine(),
  source: { kind: 'flow', flow: { type: 'leaf', actionId: 'noop' } },
  ownerPlayerIndex: 0,
  spaceId: '__subflow:test',
  stageResume: null,
  deferredPlayerSwitch: null,
  reason: 'reorganize',
  ...overrides,
})

describe('EngineStack', () => {
  it('push then current returns frame', () => {
    const stack = new EngineStack()
    const frame = makeFrame({ ownerPlayerIndex: 1 })
    stack.push(frame)
    expect(stack.current()).toBe(frame)
    expect(stack.depth()).toBe(1)
  })

  it('push two then pop returns top, current returns bottom', () => {
    const stack = new EngineStack()
    const bottom = makeFrame({ ownerPlayerIndex: 0 })
    const top = makeFrame({ ownerPlayerIndex: 1 })
    stack.push(bottom)
    stack.push(top)
    expect(stack.pop()).toBe(top)
    expect(stack.current()).toBe(bottom)
    expect(stack.depth()).toBe(1)
  })

  it('empty stack returns undefined', () => {
    const stack = new EngineStack()
    expect(stack.current()).toBeUndefined()
    expect(stack.pop()).toBeUndefined()
    expect(stack.depth()).toBe(0)
  })

  it('toCursor then fromCursor preserves frame metadata', () => {
    const stack = new EngineStack()
    const frame = makeFrame({
      ownerPlayerIndex: 1,
      spaceId: '__subflow:reorganize',
      reason: 'reorganize',
      stageResume: { hook: 'onReorganizeComplete', playerIndex: 1, cardIndex: 0, extra: { trigger: 'anytime' } },
    })
    stack.push(frame)

    const cursor = stack.toCursor()
    expect(cursor.frames).toHaveLength(1)
    expect(cursor.frames[0]!.ownerPlayerIndex).toBe(1)
    expect(cursor.frames[0]!.spaceId).toBe('__subflow:reorganize')
    expect(cursor.frames[0]!.reason).toBe('reorganize')
    expect(cursor.frames[0]!.stageResume).toEqual({
      hook: 'onReorganizeComplete', playerIndex: 1, cardIndex: 0, extra: { trigger: 'anytime' },
    })

    const rebuilt = EngineStack.fromCursor(cursor, () => frame.engine)
    expect(rebuilt.depth()).toBe(1)
    expect(rebuilt.current()!.ownerPlayerIndex).toBe(1)
    expect(rebuilt.current()!.reason).toBe('reorganize')
  })
})

describe('EngineStack query/write delegation', () => {
  const pushStubFrame = (stack: EngineStack, engine: Engine) => {
    stack.push({
      engine,
      source: { kind: 'flow', flow: { type: 'leaf', actionId: 'noop' } },
      ownerPlayerIndex: 0,
      spaceId: '__subflow:test',
      stageResume: null,
      deferredPlayerSwitch: null,
      reason: 'reorganize',
    })
  }

  it('peekInteractionHost delegates to top frame engine; returns null when empty', () => {
    const stack = new EngineStack()
    expect(stack.peekInteractionHost()).toBeNull()
    const engine = makeEngine()
    const fakeHost = { id: 'n1' } as unknown as ReturnType<Engine['peekInteractionHost']>
    const spy = vi.spyOn(engine, 'peekInteractionHost').mockReturnValue(fakeHost)
    pushStubFrame(stack, engine)
    expect(stack.peekInteractionHost()).toBe(fakeHost)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('peekPendingChoiceFromComposite delegates to top frame engine', () => {
    const stack = new EngineStack()
    const engine = makeEngine()
    const result = {
      nodeId: 'n1',
      options: [],
      promptKey: undefined,
      promptParams: undefined,
      request: undefined,
    }
    const spy = vi.spyOn(engine, 'peekPendingChoiceFromComposite').mockReturnValue(result)
    pushStubFrame(stack, engine)
    expect(stack.peekPendingChoiceFromComposite()).toBe(result)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('hasPendingChoiceCompositeAncestor delegates to top frame engine', () => {
    const stack = new EngineStack()
    expect(stack.hasPendingChoiceCompositeAncestor()).toBe(false)
    const engine = makeEngine()
    const spy = vi.spyOn(engine, 'hasPendingChoiceCompositeAncestor').mockReturnValue(true)
    pushStubFrame(stack, engine)
    expect(stack.hasPendingChoiceCompositeAncestor()).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('insertFlowAfterPendingChoice delegates to top frame engine', () => {
    const stack = new EngineStack()
    const engine = makeEngine()
    const spy = vi.spyOn(engine, 'insertFlowAfterPendingChoice').mockImplementation(() => {})
    pushStubFrame(stack, engine)
    const flow = { type: 'leaf' as const, actionId: 'test' }
    stack.insertFlowAfterPendingChoice(flow)
    expect(spy).toHaveBeenCalledWith(flow)
  })

  it('insertFlowAfterPendingChoice on empty stack is a no-op', () => {
    const stack = new EngineStack()
    expect(() => stack.insertFlowAfterPendingChoice({ type: 'leaf', actionId: 'noop' })).not.toThrow()
  })
})
