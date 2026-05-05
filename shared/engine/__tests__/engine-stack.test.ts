import { describe, it, expect } from 'vitest'
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
