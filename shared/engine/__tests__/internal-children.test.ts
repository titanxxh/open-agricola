import { beforeEach, describe, expect, it } from 'vitest'
import type {
  ActionDefinition,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../contract/types'
import { ActionRegistry } from '../registry'
import { CardRegistry } from '../../cards/registry'
import { setActiveCardRegistry } from '../../cards/active-registry'
import { Engine } from '../engine'
import { EngineTree } from '../tree'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import { ActionNode, SequenceNode } from '../nodes'
import { clearActionHooks, registerActionHook } from '../../actions/hooks'

const createState = () =>
  ({
    round: 1,
    currentPlayerIndex: 0,
    players: [],
    actionSpaces: [],
    log: [],
    roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
  }) as GameState

const createPlayer = () =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: {
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
      food: 10,
      grain: 0,
      vegetable: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
      begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
    ],
    rooms: 2,
    houseType: 'wood',
    fields: [],
    fences: 0,
    roomTiles: [],
    stableTiles: [],
    improvements: [],
    minorHand: [],
    minorPlayed: [],
    occupationHand: [],
    occupationPlayed: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
  }) as PlayerState

const createSpace = (action: ActionDefinition): ActionSpace => ({
  ...action,
  resources: {
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
  },
  takenBy: [],
})

const buildEngine = (actions: ActionDefinition[], hostActionId: string) => {
  const registry = new ActionRegistry()
  actions.forEach((action) => registry.register(action))
  const root = new SequenceNode(`sequence-${hostActionId}`, [
    new ActionNode(`action-${hostActionId}`, hostActionId),
  ])
  return new Engine({
    tree: new EngineTree(root),
    registry,
    hooks: new HookDispatcher(),
    log: new LogStore(),
  })
}

const runUntilDone = (
  engine: Engine,
  context: { state: GameState; player: PlayerState; space: ActionSpace },
) => {
  let step = engine.proceed(context)
  let safety = 20
  while (safety-- > 0 && step.type === 'ok') {
    step = engine.proceed(context)
  }
  return step
}

describe('engine internal children', () => {
  beforeEach(() => {
    clearActionHooks()
    setActiveCardRegistry(new CardRegistry())
  })

  it('runs beforeHostListeners children before host after listeners', () => {
    const events: string[] = []
    const hostAction: ActionDefinition = {
      id: 'host-before-slot',
      nameKey: 'test.hostBefore',
      descriptionKey: 'test.hostBefore',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('host.execute')
        return {
          type: 'ok',
          internalChildren: {
            beforeHostListeners: [
              { actionId: 'internal-pay-probe', resultKey: 'payment' },
              { actionId: 'internal-onbuy-probe', paymentInfoFrom: 'payment' },
            ],
          },
        }
      },
    }
    const payProbe: ActionDefinition = {
      id: 'internal-pay-probe',
      nameKey: 'test.payProbe',
      descriptionKey: 'test.payProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('internal-pay-probe.execute')
        return { type: 'ok', resourcesPaid: { food: 2 } }
      },
    }
    const onBuyProbe: ActionDefinition = {
      id: 'internal-onbuy-probe',
      nameKey: 'test.onBuyProbe',
      descriptionKey: 'test.onBuyProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: ({ actionContext }) => {
        const paymentInfo = actionContext?.paymentInfo as { resourcesPaid?: { food?: number } } | undefined
        events.push(`internal-onbuy-probe.payment=${paymentInfo?.resourcesPaid?.food ?? 'missing'}`)
        return { type: 'ok' }
      },
    }
    registerActionHook({
      id: 'host-before-after',
      actions: ['host-before-slot'],
      phases: ['after'],
      handler: () => {
        events.push('host.after')
      },
    })
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    const space = createSpace(hostAction)
    const engine = buildEngine([hostAction, payProbe, onBuyProbe], hostAction.id)

    const step = runUntilDone(engine, { state, player, space })

    expect(step.type).toBe('done')
    expect(events).toEqual([
      'host.execute',
      'internal-pay-probe.execute',
      'internal-onbuy-probe.payment=2',
      'host.after',
    ])
  })

  it('runs afterHostCommitListeners children after host commit and before host after listeners', () => {
    const events: string[] = []
    const hostAction: ActionDefinition = {
      id: 'host-commit-slot',
      nameKey: 'test.hostCommit',
      descriptionKey: 'test.hostCommit',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('host.execute')
        return {
          type: 'ok',
          internalChildren: {
            beforeHostListeners: [
              { actionId: 'internal-pay-probe', resultKey: 'payment' },
            ],
            afterHostCommitListeners: [
              { actionId: 'internal-onbuy-probe', paymentInfoFrom: 'payment' },
            ],
          },
        }
      },
      completeInternalChildren: () => {
        events.push('host.commit')
        return { type: 'ok' }
      },
    }
    const payProbe: ActionDefinition = {
      id: 'internal-pay-probe',
      nameKey: 'test.payProbe',
      descriptionKey: 'test.payProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('internal-pay-probe.execute')
        return { type: 'ok', resourcesPaid: { food: 2 } }
      },
    }
    const onBuyProbe: ActionDefinition = {
      id: 'internal-onbuy-probe',
      nameKey: 'test.onBuyProbe',
      descriptionKey: 'test.onBuyProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: ({ actionContext }) => {
        const paymentInfo = actionContext?.paymentInfo as { resourcesPaid?: { food?: number } } | undefined
        events.push(`internal-onbuy-probe.payment=${paymentInfo?.resourcesPaid?.food ?? 'missing'}`)
        return { type: 'ok' }
      },
    }
    registerActionHook({
      id: 'host-commit-after',
      actions: ['host-commit-slot'],
      phases: ['after'],
      handler: () => {
        events.push('host.after')
      },
    })
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    const space = createSpace(hostAction)
    const engine = buildEngine([hostAction, payProbe, onBuyProbe], hostAction.id)

    const step = runUntilDone(engine, { state, player, space })

    expect(step.type).toBe('done')
    expect(events).toEqual([
      'host.execute',
      'internal-pay-probe.execute',
      'host.commit',
      'internal-onbuy-probe.payment=2',
      'host.after',
    ])
  })

  it('waits for afterHostCommitListeners flow before host after listeners without repeating host commit', () => {
    const events: string[] = []
    let commitCount = 0
    const hostAction: ActionDefinition = {
      id: 'host-commit-flow-slot',
      nameKey: 'test.hostCommitFlow',
      descriptionKey: 'test.hostCommitFlow',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('host.execute')
        return {
          type: 'ok',
          internalChildren: {
            beforeHostListeners: [
              { actionId: 'internal-pay-probe', resultKey: 'payment' },
            ],
            afterHostCommitListeners: [
              { actionId: 'internal-onbuy-flow-probe', paymentInfoFrom: 'payment' },
            ],
          },
        }
      },
      completeInternalChildren: () => {
        commitCount += 1
        events.push(`host.commit.${commitCount}`)
        return { type: 'ok' }
      },
    }
    const payProbe: ActionDefinition = {
      id: 'internal-pay-probe',
      nameKey: 'test.payProbe',
      descriptionKey: 'test.payProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('internal-pay-probe.execute')
        return { type: 'ok', resourcesPaid: { food: 2 } }
      },
    }
    const onBuyProbe: ActionDefinition = {
      id: 'internal-onbuy-flow-probe',
      nameKey: 'test.onBuyFlowProbe',
      descriptionKey: 'test.onBuyFlowProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: ({ actionContext }) => {
        const paymentInfo = actionContext?.paymentInfo as { resourcesPaid?: { food?: number } } | undefined
        events.push(`internal-onbuy-flow-probe.payment=${paymentInfo?.resourcesPaid?.food ?? 'missing'}`)
        return { type: 'flow', flow: { type: 'leaf', actionId: 'internal-onbuy-choice-probe' } }
      },
    }
    const choiceProbe: ActionDefinition = {
      id: 'internal-onbuy-choice-probe',
      nameKey: 'test.onBuyChoiceProbe',
      descriptionKey: 'test.onBuyChoiceProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('internal-onbuy-choice-probe.execute')
        return {
          type: 'request',
          promptKey: 'test.choose',
          request: {
            kind: 'choice',
            options: [{ value: 'selected', labelKey: 'test.selected' }],
          },
        }
      },
      resolveChoice: (_context, choice) => {
        events.push(`internal-onbuy-choice-probe.resolve=${choice}`)
        return { type: 'ok' }
      },
    }
    registerActionHook({
      id: 'host-commit-flow-after',
      actions: ['host-commit-flow-slot'],
      phases: ['after'],
      handler: () => {
        events.push(`host.after.commitCount=${commitCount}`)
      },
    })
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    const space = createSpace(hostAction)
    const engine = buildEngine([hostAction, payProbe, onBuyProbe, choiceProbe], hostAction.id)

    const pendingStep = runUntilDone(engine, { state, player, space })

    expect(pendingStep.type).toBe('choice')
    expect(commitCount).toBe(1)
    expect(events).toEqual([
      'host.execute',
      'internal-pay-probe.execute',
      'host.commit.1',
      'internal-onbuy-flow-probe.payment=2',
      'internal-onbuy-choice-probe.execute',
    ])

    expect(engine.resolveChoice('selected', { state, player, space }).type).toBe('ok')
    const finalStep = runUntilDone(engine, { state, player, space })

    expect(finalStep.type).toBe('done')
    expect(commitCount).toBe(1)
    expect(events).toEqual([
      'host.execute',
      'internal-pay-probe.execute',
      'host.commit.1',
      'internal-onbuy-flow-probe.payment=2',
      'internal-onbuy-choice-probe.execute',
      'internal-onbuy-choice-probe.resolve=selected',
      'host.after.commitCount=1',
    ])
  })

  it('runs afterHostListeners children after host after listeners', () => {
    const events: string[] = []
    const hostAction: ActionDefinition = {
      id: 'host-after-slot',
      nameKey: 'test.hostAfter',
      descriptionKey: 'test.hostAfter',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('host.execute')
        return {
          type: 'ok',
          internalChildren: {
            afterHostListeners: [
              { actionId: 'internal-pay-probe', resultKey: 'payment' },
            ],
          },
        }
      },
    }
    const payProbe: ActionDefinition = {
      id: 'internal-pay-probe',
      nameKey: 'test.payProbe',
      descriptionKey: 'test.payProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('internal-pay-probe.execute')
        return { type: 'ok', resourcesPaid: { food: 2 } }
      },
    }
    registerActionHook({
      id: 'host-after-after',
      actions: ['host-after-slot'],
      phases: ['after'],
      handler: () => {
        events.push('host.after')
      },
    })
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    const space = createSpace(hostAction)
    const engine = buildEngine([hostAction, payProbe], hostAction.id)

    const step = runUntilDone(engine, { state, player, space })

    expect(step.type).toBe('done')
    expect(events).toEqual([
      'host.execute',
      'host.after',
      'internal-pay-probe.execute',
    ])
  })

  it('waits for an internal child pending result before executing following siblings', () => {
    const events: string[] = []
    const hostAction: ActionDefinition = {
      id: 'host-before-slot',
      nameKey: 'test.hostBefore',
      descriptionKey: 'test.hostBefore',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('host.execute')
        return {
          type: 'ok',
          internalChildren: {
            beforeHostListeners: [
              { actionId: 'internal-pay-probe', params: { request: true }, resultKey: 'payment' },
              { actionId: 'internal-onbuy-probe', paymentInfoFrom: 'payment' },
            ],
          },
        }
      },
    }
    const payProbe: ActionDefinition = {
      id: 'internal-pay-probe',
      nameKey: 'test.payProbe',
      descriptionKey: 'test.payProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: ({ params }) => {
        events.push('internal-pay-probe.execute')
        if (params?.request === true) {
          return {
            type: 'request',
            promptKey: 'prompt.selectPayment',
            request: {
              kind: 'choice',
              options: [{ value: 'pay-two', labelKey: 'test.payTwo' }],
            },
          }
        }
        return { type: 'ok', resourcesPaid: { food: 2 } }
      },
      resolveChoice: () => {
        events.push('internal-pay-probe.resolve')
        return { type: 'ok', resourcesPaid: { food: 2 } }
      },
    }
    const onBuyProbe: ActionDefinition = {
      id: 'internal-onbuy-probe',
      nameKey: 'test.onBuyProbe',
      descriptionKey: 'test.onBuyProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: ({ actionContext }) => {
        const paymentInfo = actionContext?.paymentInfo as { resourcesPaid?: { food?: number } } | undefined
        events.push(`internal-onbuy-probe.payment=${paymentInfo?.resourcesPaid?.food ?? 'missing'}`)
        return { type: 'ok' }
      },
    }
    registerActionHook({
      id: 'host-before-after',
      actions: ['host-before-slot'],
      phases: ['after'],
      handler: () => {
        events.push('host.after')
      },
    })
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    const space = createSpace(hostAction)
    const engine = buildEngine([hostAction, payProbe, onBuyProbe], hostAction.id)

    expect(engine.proceed({ state, player, space }).type).toBe('ok')
    const pendingStep = engine.proceed({ state, player, space })

    expect(pendingStep.type).toBe('choice')
    expect(engine.peekPendingEnvelope()).toMatchObject({
      pendingActionId: 'internal-pay-probe',
      internalResultKey: 'payment',
    })
    expect(events).toEqual([
      'host.execute',
      'internal-pay-probe.execute',
    ])

    const resolved = engine.resolveChoice('pay-two', { state, player, space })
    expect(resolved.type).toBe('ok')
    const finalStep = runUntilDone(engine, { state, player, space })

    expect(finalStep.type).toBe('done')
    expect(events).toEqual([
      'host.execute',
      'internal-pay-probe.execute',
      'internal-pay-probe.resolve',
      'internal-onbuy-probe.payment=2',
      'host.after',
    ])
  })

  it('runs a host finalizer after delayed internal child success before host after listeners', () => {
    const events: string[] = []
    const hostAction: ActionDefinition = {
      id: 'host-finalizer-slot',
      nameKey: 'test.hostFinalizer',
      descriptionKey: 'test.hostFinalizer',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('host.execute')
        return {
          type: 'ok',
          internalChildren: {
            beforeHostListeners: [
              { actionId: 'internal-pay-probe', resultKey: 'payment' },
            ],
          },
        }
      },
      completeInternalChildren: ({ player }, result, internalResults) => {
        const payment = internalResults.payment
        const paidFood = payment?.type === 'ok' ? payment.resourcesPaid?.food : undefined
        events.push(`host.finalizer.payment=${paidFood ?? 'missing'}`)
        player.resources.wood = 7
        return result
      },
    }
    const payProbe: ActionDefinition = {
      id: 'internal-pay-probe',
      nameKey: 'test.payProbe',
      descriptionKey: 'test.payProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('internal-pay-probe.execute')
        return {
          type: 'request',
          promptKey: 'prompt.selectPayment',
          request: {
            kind: 'choice',
            options: [{ value: 'pay-two', labelKey: 'test.payTwo' }],
          },
        }
      },
      resolveChoice: () => {
        events.push('internal-pay-probe.resolve')
        return { type: 'ok', resourcesPaid: { food: 2 } }
      },
    }
    registerActionHook({
      id: 'host-finalizer-after',
      actions: ['host-finalizer-slot'],
      phases: ['after'],
      handler: (context) => {
        events.push(`host.after.wood=${context.player.resources.wood}`)
      },
    })
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    const space = createSpace(hostAction)
    const engine = buildEngine([hostAction, payProbe], hostAction.id)

    expect(engine.proceed({ state, player, space }).type).toBe('ok')
    const pendingStep = engine.proceed({ state, player, space })

    expect(pendingStep.type).toBe('choice')
    expect(player.resources.wood).toBe(0)
    expect(events).toEqual([
      'host.execute',
      'internal-pay-probe.execute',
    ])

    expect(engine.resolveChoice('pay-two', { state, player, space }).type).toBe('ok')
    expect(player.resources.wood).toBe(0)
    const finalStep = runUntilDone(engine, { state, player, space })

    expect(finalStep.type).toBe('done')
    expect(player.resources.wood).toBe(7)
    expect(events).toEqual([
      'host.execute',
      'internal-pay-probe.execute',
      'internal-pay-probe.resolve',
      'host.finalizer.payment=2',
      'host.after.wood=7',
    ])
  })

  it('restores completed internal child results before executing following siblings', () => {
    const events: string[] = []
    const hostAction: ActionDefinition = {
      id: 'host-before-slot',
      nameKey: 'test.hostBefore',
      descriptionKey: 'test.hostBefore',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('host.execute')
        return {
          type: 'ok',
          internalChildren: {
            beforeHostListeners: [
              { actionId: 'internal-pay-probe', resultKey: 'payment' },
              { actionId: 'internal-onbuy-probe', paymentInfoFrom: 'payment' },
            ],
          },
        }
      },
    }
    const payProbe: ActionDefinition = {
      id: 'internal-pay-probe',
      nameKey: 'test.payProbe',
      descriptionKey: 'test.payProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('internal-pay-probe.execute')
        return { type: 'ok', resourcesPaid: { food: 2 } }
      },
    }
    const onBuyProbe: ActionDefinition = {
      id: 'internal-onbuy-probe',
      nameKey: 'test.onBuyProbe',
      descriptionKey: 'test.onBuyProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: ({ actionContext }) => {
        const paymentInfo = actionContext?.paymentInfo as { resourcesPaid?: { food?: number } } | undefined
        events.push(`internal-onbuy-probe.payment=${paymentInfo?.resourcesPaid?.food ?? 'missing'}`)
        return { type: 'ok' }
      },
    }
    const actions = [hostAction, payProbe, onBuyProbe]
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    const space = createSpace(hostAction)
    const engine = buildEngine(actions, hostAction.id)

    expect(engine.proceed({ state, player, space }).type).toBe('ok')
    expect(engine.proceed({ state, player, space }).type).toBe('ok')

    const restored = buildEngine(actions, hostAction.id)
    restored.restore(engine.snapshot())
    const step = runUntilDone(restored, { state, player, space })

    expect(step.type).toBe('done')
    expect(events).toEqual([
      'host.execute',
      'internal-pay-probe.execute',
      'internal-onbuy-probe.payment=2',
    ])
  })

  it('keeps an internal child result when that child defers to its own beforeHostListeners', () => {
    const events: string[] = []
    const hostAction: ActionDefinition = {
      id: 'host-before-slot',
      nameKey: 'test.hostBefore',
      descriptionKey: 'test.hostBefore',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('host.execute')
        return {
          type: 'ok',
          internalChildren: {
            beforeHostListeners: [
              { actionId: 'internal-pay-probe', params: { nestedBefore: true }, resultKey: 'payment' },
              { actionId: 'internal-onbuy-probe', paymentInfoFrom: 'payment' },
            ],
          },
        }
      },
    }
    const payProbe: ActionDefinition = {
      id: 'internal-pay-probe',
      nameKey: 'test.payProbe',
      descriptionKey: 'test.payProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: ({ params }) => {
        events.push('internal-pay-probe.execute')
        return {
          type: 'ok',
          resourcesPaid: { food: 2 },
          internalChildren: params?.nestedBefore === true
            ? { beforeHostListeners: [{ actionId: 'internal-nested-probe' }] }
            : undefined,
        }
      },
    }
    const nestedProbe: ActionDefinition = {
      id: 'internal-nested-probe',
      nameKey: 'test.nestedProbe',
      descriptionKey: 'test.nestedProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('internal-nested-probe.execute')
        return { type: 'ok' }
      },
    }
    const onBuyProbe: ActionDefinition = {
      id: 'internal-onbuy-probe',
      nameKey: 'test.onBuyProbe',
      descriptionKey: 'test.onBuyProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: ({ actionContext }) => {
        const paymentInfo = actionContext?.paymentInfo as { resourcesPaid?: { food?: number } } | undefined
        events.push(`internal-onbuy-probe.payment=${paymentInfo?.resourcesPaid?.food ?? 'missing'}`)
        return { type: 'ok' }
      },
    }
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    const space = createSpace(hostAction)
    const engine = buildEngine([hostAction, payProbe, nestedProbe, onBuyProbe], hostAction.id)

    const step = runUntilDone(engine, { state, player, space })

    expect(step.type).toBe('done')
    expect(events).toEqual([
      'host.execute',
      'internal-pay-probe.execute',
      'internal-nested-probe.execute',
      'internal-onbuy-probe.payment=2',
    ])
  })

  it('does not complete parent host when nested required beforeHost child fails', () => {
    const events: string[] = []
    const hostAction: ActionDefinition = {
      id: 'host-nested-before-fail-slot',
      nameKey: 'test.hostNestedBeforeFail',
      descriptionKey: 'test.hostNestedBeforeFail',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('host.execute')
        return {
          type: 'ok',
          internalChildren: {
            beforeHostListeners: [
              { actionId: 'internal-pay-probe', resultKey: 'payment' },
            ],
            afterHostListeners: [
              { actionId: 'internal-after-probe', paymentInfoFrom: 'payment' },
            ],
          },
        }
      },
      completeInternalChildren: () => {
        events.push('host.finalizer')
        return { type: 'ok' }
      },
    }
    const payProbe: ActionDefinition = {
      id: 'internal-pay-probe',
      nameKey: 'test.payProbe',
      descriptionKey: 'test.payProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('internal-pay-probe.execute')
        return {
          type: 'ok',
          resourcesPaid: { food: 2 },
          internalChildren: {
            beforeHostListeners: [
              { actionId: 'internal-nested-probe', resultKey: 'nested' },
            ],
          },
        }
      },
      completeInternalChildren: () => {
        events.push('internal-pay-probe.finalizer')
        return { type: 'ok', resourcesPaid: { food: 2 } }
      },
    }
    const nestedProbe: ActionDefinition = {
      id: 'internal-nested-probe',
      nameKey: 'test.nestedProbe',
      descriptionKey: 'test.nestedProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('internal-nested-probe.execute')
        return { type: 'fail', errorKey: 'log.payFail' }
      },
    }
    const afterProbe: ActionDefinition = {
      id: 'internal-after-probe',
      nameKey: 'test.afterProbe',
      descriptionKey: 'test.afterProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('internal-after-probe.execute')
        return { type: 'ok' }
      },
    }
    registerActionHook({
      id: 'host-nested-before-fail-after',
      actions: ['host-nested-before-fail-slot'],
      phases: ['after'],
      handler: () => {
        events.push('host.after')
      },
    })
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    const space = createSpace(hostAction)
    const engine = buildEngine([hostAction, payProbe, nestedProbe, afterProbe], hostAction.id)

    const step = runUntilDone(engine, { state, player, space })

    expect(step.type).toBe('done')
    expect(events).toEqual([
      'host.execute',
      'internal-pay-probe.execute',
      'internal-nested-probe.execute',
    ])
  })

  it('includes beforeHost child events when deferred host hooks run after internal children', () => {
    let afterActionEventReasons: string[] | undefined
    let afterTransactionEventReasons: string[] | undefined
    const hostAction: ActionDefinition = {
      id: 'host-before-slot',
      nameKey: 'test.hostBefore',
      descriptionKey: 'test.hostBefore',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: ({ eventSink }) => {
        eventSink.emit<'resource.moved'>({
          type: 'resource.moved',
          resources: { wood: 1 },
          from: { kind: 'supply' },
          to: { kind: 'player', playerId: 'p1' },
          reason: 'receive',
        })
        return {
          type: 'ok',
          internalChildren: {
            beforeHostListeners: [{ actionId: 'internal-pay-probe' }],
          },
        }
      },
    }
    const payProbe: ActionDefinition = {
      id: 'internal-pay-probe',
      nameKey: 'test.payProbe',
      descriptionKey: 'test.payProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: ({ eventSink }) => {
        eventSink.emit<'resource.moved'>({
          type: 'resource.moved',
          resources: { food: 1 },
          from: { kind: 'supply' },
          to: { kind: 'player', playerId: 'p1' },
          reason: 'cardEffect',
        })
        return { type: 'ok', resourcesPaid: { food: 1 } }
      },
    }
    registerActionHook({
      id: 'host-before-after-events',
      actions: ['host-before-slot'],
      phases: ['after'],
      handler: (context) => {
        afterActionEventReasons = context.actionEvents
          ?.filter((event) => event.type === 'resource.moved')
          .map((event) => event.reason)
        afterTransactionEventReasons = context.transactionEvents
          .filter((event) => event.type === 'resource.moved')
          .map((event) => event.reason)
      },
    })
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    const space = createSpace(hostAction)
    const engine = buildEngine([hostAction, payProbe], hostAction.id)

    const step = runUntilDone(engine, { state, player, space })

    expect(step.type).toBe('done')
    expect(afterActionEventReasons).toEqual(['receive', 'cardEffect'])
    expect(afterTransactionEventReasons).toEqual(['receive', 'cardEffect'])
  })

  it('does not run host finalizer, hooks, or afterHost children when required beforeHost result fails', () => {
    const events: string[] = []
    const hostAction: ActionDefinition = {
      id: 'host-before-fail-slot',
      nameKey: 'test.hostBeforeFail',
      descriptionKey: 'test.hostBeforeFail',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('host.execute')
        return {
          type: 'ok',
          internalChildren: {
            beforeHostListeners: [
              { actionId: 'internal-pay-probe', resultKey: 'payment' },
            ],
            afterHostListeners: [
              { actionId: 'internal-onbuy-probe', paymentInfoFrom: 'payment' },
            ],
          },
        }
      },
      completeInternalChildren: () => {
        events.push('host.finalizer')
        return { type: 'ok' }
      },
    }
    const payProbe: ActionDefinition = {
      id: 'internal-pay-probe',
      nameKey: 'test.payProbe',
      descriptionKey: 'test.payProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('internal-pay-probe.execute')
        return { type: 'fail', errorKey: 'log.payFail' }
      },
    }
    const onBuyProbe: ActionDefinition = {
      id: 'internal-onbuy-probe',
      nameKey: 'test.onBuyProbe',
      descriptionKey: 'test.onBuyProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('internal-onbuy-probe.execute')
        return { type: 'ok' }
      },
    }
    registerActionHook({
      id: 'host-before-fail-after',
      actions: ['host-before-fail-slot'],
      phases: ['after'],
      handler: () => {
        events.push('host.after')
      },
    })
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    const space = createSpace(hostAction)
    const engine = buildEngine([hostAction, payProbe, onBuyProbe], hostAction.id)

    const step = runUntilDone(engine, { state, player, space })

    expect(step.type).toBe('done')
    expect(events).toEqual([
      'host.execute',
      'internal-pay-probe.execute',
    ])
  })

  it('restores deferred host choice before dispatching host after hooks', () => {
    const events: string[] = []
    const hostAction: ActionDefinition = {
      id: 'host-choice-slot',
      nameKey: 'test.hostChoice',
      descriptionKey: 'test.hostChoice',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('host.execute')
        return {
          type: 'request',
          promptKey: 'test.choose',
          request: {
            kind: 'choice',
            options: [{ value: 'selected-card', labelKey: 'test.selectedCard' }],
          },
        }
      },
      resolveChoice: (_context, choice) => {
        events.push(`host.resolve=${choice}`)
        return {
          type: 'ok',
          internalChildren: {
            beforeHostListeners: [
              { actionId: 'internal-pay-probe', resultKey: 'payment' },
            ],
          },
        }
      },
    }
    const payProbe: ActionDefinition = {
      id: 'internal-pay-probe',
      nameKey: 'test.payProbe',
      descriptionKey: 'test.payProbe',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('internal-pay-probe.execute')
        return { type: 'ok', resourcesPaid: { food: 1 } }
      },
    }
    registerActionHook({
      id: 'host-choice-after',
      actions: ['host-choice-slot'],
      phases: ['after'],
      handler: (context) => {
        events.push(`host.after.choice=${context.choice ?? 'missing'}`)
      },
    })
    const actions = [hostAction, payProbe]
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    const space = createSpace(hostAction)
    const engine = buildEngine(actions, hostAction.id)

    expect(engine.proceed({ state, player, space }).type).toBe('choice')
    expect(engine.resolveChoice('selected-card', { state, player, space }).type).toBe('ok')
    expect(engine.proceed({ state, player, space }).type).toBe('ok')

    const restored = buildEngine(actions, hostAction.id)
    restored.restore(engine.snapshot())
    const step = runUntilDone(restored, { state, player, space })

    expect(step.type).toBe('done')
    expect(events).toEqual([
      'host.execute',
      'host.resolve=selected-card',
      'internal-pay-probe.execute',
      'host.after.choice=selected-card',
    ])
  })
})
