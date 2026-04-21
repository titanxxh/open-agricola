import { beforeEach, describe, expect, it } from 'vitest'
import type {
  ActionDefinition,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../game/types'
import { ActionRegistry } from '../registry'
import { Engine } from '../engine'
import { EngineTree } from '../tree'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import { ActionNode, ChoiceNode, SequenceNode } from '../nodes'
import { clearActionHooks, registerActionHook } from '../../actions/hooks'
import { clearCardListeners } from '../../cards/registry-ops'

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

describe('Engine pipeline phase order', () => {
  beforeEach(() => {
    clearActionHooks()
    clearCardListeners()
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
      'isDoable',
      'computeCosts',
      'before',
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
          type: 'choice',
          promptKey: 'choose',
          options: [{ value: 'a', labelKey: 'A' }],
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
          new ChoiceNode('c', []),
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
      'isDoable',
      'computeCosts',
      'before',
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
        type: 'choice',
        promptKey: 'choose',
        options: [{ value: 'base', labelKey: 'Base' }],
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
          new ChoiceNode('c', []),
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
})
