import { beforeEach, describe, it, expect } from 'vitest'
import { ActionRegistry } from '../registry'
import { EngineTree } from '../tree'
import { Engine } from '../engine'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import { ActionNode, OptionalNode } from '../nodes'
import { clearActionHooks } from '../../actions/hooks'
import { clearCardListeners, registerCardListener } from '../../cards/registry-ops'

beforeEach(() => {
  clearActionHooks()
  clearCardListeners()
})

describe('OptionalNode passes actionContext to isDoable', () => {
  const makePlayer = () =>
    ({
      id: 'p1',
      name: 'P1',
      color: 'red',
      resources: {},
      workers: [{ id: '1', isActive: true, isNewborn: false }],
      improvements: [],
      minorPlayed: ['TestCard'],
      occupationPlayed: [],
      cardStates: {},
    }) as any

  const makeState = () =>
    ({
      round: 1,
      currentPlayerIndex: 0,
      players: [makePlayer()],
      actionSpaces: [],
      log: [],
      roundStartSnapshot: null,
      roundActionOrder: [],
      gameSeed: 1,
      availableMajorImprovements: [],
      futureMeeples: [],
      pendingFutureMeeples: [],
      gameOver: false,
    }) as any

  it('isDoable listener receives actionContext from OptionalNode', () => {
    const actionNode = new ActionNode(
      'action-1',
      'test-action',
      'TestCard',       // sourceCard
      undefined,        // params
      undefined,        // choiceLabelKey
      undefined,        // choiceLabelParams
      { override: true, customKey: 42 },  // actionContext
    )
    const optionalNode = new OptionalNode('optional-1', actionNode)
    const tree = new EngineTree(optionalNode)

    const registry = new ActionRegistry()
    registry.register({
      id: 'test-action',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => false,
      execute: () => ({ type: 'ok' }),
    })

    let receivedActionContext: Record<string, unknown> | undefined
    registerCardListener({
      id: 'test-isdoable',
      cardIds: ['TestCard'],
      phases: ['isDoable'],
      actions: ['test-action'],
      handler: (context) => {
        receivedActionContext = context.actionContext as Record<string, unknown> | undefined
        if (context.actionContext?.override) return { doable: true }
      },
    })

    const hooks = new HookDispatcher()
    const log = new LogStore()
    const engine = new Engine({ tree, registry, hooks, log })

    const step = engine.proceed({
      state: makeState(),
      player: makePlayer(),
      space: {} as any,
    })

    expect(receivedActionContext).toEqual({ override: true, customKey: 42 })
    expect(step.type).toBe('choice')
  })

  it('isDoable listener receives sourceCard from OptionalNode', () => {
    const actionNode = new ActionNode(
      'action-1',
      'test-action',
      'TestCard',       // sourceCard
    )
    const optionalNode = new OptionalNode('optional-1', actionNode)
    const tree = new EngineTree(optionalNode)

    const registry = new ActionRegistry()
    registry.register({
      id: 'test-action',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => false,
      execute: () => ({ type: 'ok' }),
    })

    let receivedSourceCard: string | undefined
    registerCardListener({
      id: 'test-isdoable-source',
      cardIds: ['TestCard'],
      phases: ['isDoable'],
      actions: ['test-action'],
      handler: (context) => {
        receivedSourceCard = context.sourceCard
        if (context.sourceCard === 'TestCard') return { doable: true }
      },
    })

    const hooks = new HookDispatcher()
    const log = new LogStore()
    const engine = new Engine({ tree, registry, hooks, log })

    const step = engine.proceed({
      state: makeState(),
      player: makePlayer(),
      space: {} as any,
    })

    expect(receivedSourceCard).toBe('TestCard')
    expect(step.type).toBe('choice')
  })
})
