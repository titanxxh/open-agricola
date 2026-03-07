import { describe, expect, it } from 'vitest'
import { ActionRegistry } from '../registry'
import { EngineTree } from '../tree'
import { Engine } from '../engine'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import { ActionNode, OptionalNode } from '../nodes'

describe('optional node active', () => {
  it('should not return blocked when active is true', () => {
    const minorAction = new ActionNode('action-minor', 'test-minor')
    const optionalNode = new OptionalNode('optional-minor', minorAction, 'ui.interactionOptionalAction')
    optionalNode.active = true // Set active to true
    const tree = new EngineTree(optionalNode)
    const registry = new ActionRegistry()
    registry.register({
      id: 'test-minor',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    })
    const hooks = new HookDispatcher()
    const log = new LogStore()
    const engine = new Engine({ tree, registry, hooks, log })

    const step = engine.proceed({ state: {} as any, player: {} as any, space: {} as any })
    console.log('step:', step)
    expect(step.type).not.toBe('blocked')
  })
})
