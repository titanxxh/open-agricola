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
import { ActionNode, SequenceNode, XorNode } from '../nodes'
import { clearActionHooks, registerActionHook } from '../../actions/hooks'

const createState = (): GameState =>
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

const createPlayer = (): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: {
      wood: 10,
      clay: 10,
      reed: 10,
      stone: 10,
      food: 10,
      grain: 10,
      vegetable: 10,
      sheep: 0,
      boar: 0,
      cattle: 0,
      begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
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
    occupationPlayed: [],houseAnimalType: null,
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
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
    grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
  },
  takenBy: [],
})

const beforeGrantCard = 'BEFORE_GRANT_CARD'

const registerBeforeGrant = (actionId: string, phases?: string[]) => {
  const cardRegistry = new CardRegistry()
  cardRegistry.registerListener({
    id: `before-grant-${actionId}`,
    cardIds: [beforeGrantCard],
    actions: [actionId],
    phases: ['before'],
    mandatory: true,
    handler: (ctx) => {
      if (
        actionId === 'pending-before-cost' &&
        (ctx as { pendingCommit?: boolean }).pendingCommit !== true
      ) {
        return undefined
      }
      phases?.push('before')
      return {
        flow: { type: 'leaf' as const, actionId: 'grant-before-resource' },
      }
    },
  })
  setActiveCardRegistry(cardRegistry)
}

const grantBeforeResourceAction: ActionDefinition = {
  id: 'grant-before-resource',
  nameKey: 'test.grantBeforeResource',
  descriptionKey: 'test.grantBeforeResource',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: (ctx) => {
    ctx.player.resources.food += 1
    return { type: 'ok' }
  },
}

const registerFoodSensitiveCost = (
  actionId: string,
  options: { onlyWhenPendingCommit?: boolean } = {},
  phases?: string[],
) => {
  registerActionHook({
    id: `food-sensitive-cost-${actionId}`,
    actions: [actionId],
    phases: ['computeCosts'],
    handler: (ctx) => {
      if (
        options.onlyWhenPendingCommit === true &&
        ctx.params?.selectedOption === undefined &&
        ctx.actionContext?.pendingCommit !== true
      ) {
        return undefined
      }
      if (ctx.player.resources.food < 1) {
        throw new Error('computeCosts ran before before grant')
      }
      phases?.push('computeCosts')
      return { costs: { wood: -1 } }
    },
  })
}

const runUntil = (
  engine: Engine,
  context: { state: GameState; player: PlayerState; space: ActionSpace },
  done: () => boolean,
) => {
  for (let i = 0; i < 10 && !done(); i += 1) {
    const step = engine.proceed(context)
    if (step.type === 'blocked' || step.type === 'choice' || step.type === 'done') return step
  }
  return engine.proceed(context)
}

describe('Engine pipeline phase order', () => {
  beforeEach(() => {
    clearActionHooks()
    setActiveCardRegistry(new CardRegistry())
  })

  it('calls phases in correct order for simple action', () => {
    const phases: string[] = []
    const action: ActionDefinition = {
      id: 'test-action',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        phases.push('execute')
        return { type: 'ok' }
      },
    }

    registerActionHook({
      id: 'track-phases',
      actions: ['test-action'],
      phases: ['isDoable', 'computeReplace', 'computeCosts', 'computeArgs', 'before', 'during', 'immediatelyAfter', 'after'],
      handler: (ctx) => {
        phases.push(ctx.phase)
        return {}
      },
    })

    const registry = new ActionRegistry()
    registry.register(action)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('a', 'test-action')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(action)

    engine.proceed({ state, player, space })

    expect(phases).toEqual([
      'computeReplace',
      'before',
      'isDoable',
      'computeCosts',
      'execute',
      'during',
      'immediatelyAfter',
      'after',
    ])
  })

  it('includes computeArgs when action returns choice', () => {
    const phases: string[] = []
    const action: ActionDefinition = {
      id: 'choice-action',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        phases.push('execute')
        return {
          type: 'request',
          request: { kind: 'choice', options: [{ value: 'a', labelKey: 'A' }] },
          promptKey: 'choose',
        }
      },
      resolveChoice: () => ({ type: 'ok' }),
    }

    registerActionHook({
      id: 'track-phases',
      actions: ['choice-action'],
      phases: ['isDoable', 'computeReplace', 'computeCosts', 'computeArgs', 'before', 'during', 'immediatelyAfter', 'after'],
      handler: (ctx) => {
        phases.push(ctx.phase)
        return {}
      },
    })

    const registry = new ActionRegistry()
    registry.register(action)
    const engine = new Engine({
      tree: new EngineTree(
        new SequenceNode('seq', [
          new ActionNode('a', 'choice-action'),
        ]),
      ),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(action)

    const step = engine.proceed({ state, player, space })
    expect(step.type).toBe('choice')

    expect(phases).toEqual([
      'computeReplace',
      'before',
      'isDoable',
      'computeCosts',
      'execute',
      'during',
      'computeArgs',
    ])
  })

  it('passes computeCosts result to action execute via context.costs', () => {
    let receivedCosts: unknown = undefined
    const action: ActionDefinition = {
      id: 'cost-action',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: (ctx) => {
        receivedCosts = ctx.costs
        return { type: 'ok' }
      },
    }

    registerActionHook({
      id: 'discount',
      actions: ['cost-action'],
      phases: ['computeCosts'],
      handler: () => ({ costs: { wood: -2 } }),
    })

    const registry = new ActionRegistry()
    registry.register(action)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('a', 'cost-action')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(action)

    engine.proceed({ state, player, space })

    expect(receivedCosts).toEqual({ wood: -2 })
  })

  it('merges computeArgs extraOptions into choice options', () => {
    const action: ActionDefinition = {
      id: 'args-action',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'request',
        request: { kind: 'choice', options: [{ value: 'base', labelKey: 'Base' }] },
        promptKey: 'choose',
      }),
      resolveChoice: () => ({ type: 'ok' }),
    }

    registerActionHook({
      id: 'extra-args',
      actions: ['args-action'],
      phases: ['computeArgs'],
      handler: () => ({
        extraOptions: [{ value: 'extra', labelKey: 'Extra' }],
      }),
    })

    const registry = new ActionRegistry()
    registry.register(action)
    const engine = new Engine({
      tree: new EngineTree(
        new SequenceNode('seq', [
          new ActionNode('a', 'args-action'),
        ]),
      ),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(action)

    const step = engine.proceed({ state, player, space })
    expect(step.type).toBe('choice')
    if (step.type !== 'choice') return
    const values = step.choice.options.map((o) => o.value)
    expect(values).toContain('base')
    expect(values).toContain('extra')
  })

  it('hook flow returned from immediatelyAfter is inserted and executed', () => {
    const executed: string[] = []
    const main: ActionDefinition = {
      id: 'main',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        executed.push('main')
        return { type: 'ok' }
      },
    }
    const bonus: ActionDefinition = {
      id: 'bonus',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        executed.push('bonus')
        return { type: 'ok' }
      },
    }

    registerActionHook({
      id: 'immediate-flow',
      actions: ['main'],
      phases: ['immediatelyAfter'],
      handler: () => ({
        flow: { type: 'leaf' as const, actionId: 'bonus' },
      }),
    })

    const registry = new ActionRegistry()
    registry.register(main)
    registry.register(bonus)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('a', 'main')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(main)

    engine.proceed({ state, player, space })
    const second = engine.proceed({ state, player, space })
    expect(second.type).toBe('ok')
    expect(executed).toEqual(['main', 'bonus'])
  })

  it('runs before before committed isDoable and computeCosts in proceed', () => {
    let committed = false
    let receivedCosts: unknown
    const action: ActionDefinition = {
      id: 'proceed-before-cost',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: (_state, player) => player.resources.food >= 1,
      execute: (ctx) => {
        committed = true
        receivedCosts = ctx.costs
        return { type: 'ok' }
      },
    }

    registerBeforeGrant(action.id)
    registerFoodSensitiveCost(action.id)

    const registry = new ActionRegistry()
    registry.register(action)
    registry.register(grantBeforeResourceAction)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('a', action.id)),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    player.resources.food = 0
    player.minorPlayed = [beforeGrantCard]
    state.players = [player]
    const space = createSpace(action)

    runUntil(engine, { state, player, space }, () => committed)

    expect(committed).toBe(true)
    expect(receivedCosts).toEqual({ wood: -1 })
  })

  it('runs before before committed isDoable and computeCosts after xor choice', () => {
    let committed = false
    let receivedCosts: unknown
    const action: ActionDefinition = {
      id: 'xor-before-cost',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: (_state, player, ctx) =>
        ctx.actionContext?.skipBeforeTriggers === true
          ? player.resources.food >= 1
          : true,
      execute: (ctx) => {
        committed = true
        receivedCosts = ctx.costs
        return { type: 'ok' }
      },
    }

    registerBeforeGrant(action.id)
    registerFoodSensitiveCost(action.id)

    const registry = new ActionRegistry()
    registry.register(action)
    registry.register(grantBeforeResourceAction)
    const engine = new Engine({
      tree: new EngineTree(new XorNode('xor', [new ActionNode('a', action.id)])),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    player.resources.food = 0
    player.minorPlayed = [beforeGrantCard]
    state.players = [player]
    const space = createSpace(action)

    const choice = runUntil(engine, { state, player, space }, () => false)
    expect(choice.type).toBe('choice')
    engine.resolveChoice('a', { state, player, space })
    runUntil(engine, { state, player, space }, () => committed)

    expect(committed).toBe(true)
    expect(receivedCosts).toEqual({ wood: -1 })
  })

  it('runs before before committed isDoable and computeCosts after pending resolveChoice', () => {
    const phases: string[] = []
    let committed = false
    let receivedCosts: unknown
    const action: ActionDefinition = {
      id: 'pending-before-cost',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: (_state, player, ctx) => {
        if (ctx.actionContext?.pendingCommit === true) {
          phases.push('canBeExecutedByPlayer')
          return player.resources.food >= 1
        }
        return true
      },
      execute: () => ({
        type: 'request',
        request: { kind: 'choice', options: [{ value: 'commit', labelKey: 'Commit' }] },
        promptKey: 'choose',
        extraData: { actionContextWrite: { pendingCommit: true } },
      }),
      resolveChoice: (ctx) => {
        if (ctx.player.resources.food < 1 || ctx.costs?.wood !== -1) {
          return { type: 'fail', errorKey: 'log.action' }
        }
        committed = true
        receivedCosts = ctx.costs
        return { type: 'ok' }
      },
    }

    registerActionHook({
      id: 'pending-compute-replace',
      actions: [action.id],
      phases: ['computeReplace'],
      handler: (ctx) => {
        if (ctx.params?.selectedOption === 'commit') {
          phases.push('computeReplace')
        }
        return {}
      },
    })
    registerBeforeGrant(action.id, phases)
    registerFoodSensitiveCost(action.id, { onlyWhenPendingCommit: true }, phases)

    const registry = new ActionRegistry()
    registry.register(action)
    registry.register(grantBeforeResourceAction)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('a', action.id)),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    player.resources.food = 0
    state.players = [player]
    const space = createSpace(action)

    const choice = runUntil(engine, { state, player, space }, () => false)
    expect(choice.type).toBe('choice')
    player.minorPlayed = [beforeGrantCard]
    engine.resolveChoice('commit', { state, player, space })
    const restoredChoice = runUntil(engine, { state, player, space }, () => false)
    expect(restoredChoice.type).toBe('choice')
    engine.resolveChoice('commit', { state, player, space })

    expect(committed).toBe(true)
    expect(receivedCosts).toEqual({ wood: -1 })
    expect(phases).toEqual([
      'computeReplace',
      'before',
      'computeReplace',
      'canBeExecutedByPlayer',
      'computeCosts',
    ])
  })

  it('does not run committed preflight before pending cancel resolveChoice', () => {
    const phases: string[] = []
    const action: ActionDefinition = {
      id: 'pending-cancel-no-preflight',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: (_state, _player, ctx) => {
        if (ctx.actionContext?.pendingCommit === true) {
          phases.push('canBeExecutedByPlayer')
          throw new Error('preflight ran before cancel')
        }
        return true
      },
      execute: () => ({
        type: 'request',
        request: {
          kind: 'choice',
          options: [
            { value: 'commit', labelKey: 'Commit' },
            { value: 'cancel', labelKey: 'Cancel' },
          ],
        },
        promptKey: 'choose',
        extraData: { actionContextWrite: { pendingCommit: true } },
      }),
      resolveChoice: (_ctx, choice) => {
        phases.push(`resolveChoice:${choice}`)
        return { type: 'ok' }
      },
    }

    registerActionHook({
      id: 'cancel-compute-replace',
      actions: [action.id],
      phases: ['computeReplace'],
      handler: (ctx) => {
        if (ctx.params?.selectedOption === 'cancel') {
          phases.push('computeReplace')
          throw new Error('computeReplace ran before cancel')
        }
        return {}
      },
    })
    registerActionHook({
      id: 'cancel-compute-costs',
      actions: [action.id],
      phases: ['computeCosts'],
      handler: (ctx) => {
        if (ctx.params?.selectedOption === 'cancel') {
          phases.push('computeCosts')
          throw new Error('computeCosts ran before cancel')
        }
        return {}
      },
    })

    const registry = new ActionRegistry()
    registry.register(action)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('a', action.id)),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    const space = createSpace(action)

    const choice = runUntil(engine, { state, player, space }, () => false)
    expect(choice.type).toBe('choice')
    const result = engine.resolveChoice('cancel', { state, player, space })

    expect(result.type).toBe('ok')
    expect(phases).toEqual(['resolveChoice:cancel'])
  })
})
