import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ActionDefinition,
  ActionSpace,
  CanBeExecutedByPlayerContext,
  GameState,
  PlayerState,
} from '../../contract/types'
import { ActionRegistry } from '../registry'
import { CardRegistry } from '../../cards/registry'
import { setActiveCardRegistry, requireActiveCardRegistry } from '../../cards/active-registry'
import { Engine } from '../engine'
import { EngineTree } from '../tree'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import { ActionNode } from '../nodes'
import { clearActionHooks, registerActionHook } from '../../actions/hooks'
import {
  deriveCanBeExecutedByFlow,
  initializeFlowDerivedCanBeExecutedByPlayer,
} from '../../actions/flow'
import { constructAction } from '../../actions/effects/construct'
import { plowAction } from '../../actions/effects/plow'
import { stablesAction } from '../../actions/effects/stables'

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id,
    name,
    color: id === 'p1' ? 'red' : 'blue',
    resources: {
      wood: 10, clay: 10, reed: 10, stone: 10, food: 10,
      grain: 10, vegetable: 10, sheep: 0, boar: 0, cattle: 0, begging: 0,
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

const createAction = (): ActionDefinition => ({
  id: 'test-action',
  nameKey: 'test',
  descriptionKey: 'test',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
})

const createSpace = (action: ActionDefinition): ActionSpace => ({
  ...action,
  resources: {
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
    grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
  },
  takenBy: [],
})

const drainEngine = (
  engine: Engine,
  state: GameState,
  player: PlayerState,
  space: ActionSpace,
) => {
  const playerForNextNode = () => {
    const nodeId = engine.peekNextUnresolvedNodeId()
    const ownerId = nodeId ? engine.getEffectiveOwnerPlayerId(nodeId, player.id) : player.id
    return state.players.find((candidate) => candidate.id === ownerId) ?? player
  }
  let step = engine.proceed({ state, player: playerForNextNode(), space })
  while (step.type === 'ok') {
    step = engine.proceed({ state, player: playerForNextNode(), space })
  }
  return step
}

describe('Hook dispatch merge order', () => {
  beforeEach(() => {
    clearActionHooks()
    setActiveCardRegistry(new CardRegistry())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not clone state when a cost preview has no compute-cost handlers', () => {
    const player = createPlayer()
    const action = {
      ...createAction(),
      costPreview: { canExecute: () => true },
    }
    const state = {
      round: 1,
      currentPlayerIndex: 0,
      players: [player],
      actionSpaces: [],
      log: [],
      roundActionOrder: [],
      gameSeed: 1,
      availableMajorImprovements: [],
      futureMeeples: [],
      pendingFutureMeeples: [],
      gameOver: false,
    } as GameState
    const clone = vi.spyOn(globalThis, 'structuredClone')

    const doable = new HookDispatcher().applyIsDoable({
      state,
      player,
      space: createSpace(action),
      actionId: action.id,
    }, action, true)

    expect(doable).toBe(true)
    expect(clone).not.toHaveBeenCalled()
  })

  it('action hooks run before card listeners in same phase', () => {
    const order: string[] = []
    const player = createPlayer()
    player.minorPlayed = ['card-A']

    registerActionHook({
      id: 'action-hook',
      actions: ['test-action'],
      phases: ['after'],
      handler: () => {
        order.push('action-hook')
        return {}
      },
    })

    requireActiveCardRegistry('hook-dispatch').registerListener({
      id: 'card-listener',
      cardIds: ['card-A'],
      actions: ['test-action'],
      phases: ['after'],
      handler: () => {
        order.push('card-listener')
        return {}
      },
    })

    const action = createAction()
    const registry = new ActionRegistry()
    registry.register(action)
    const state: GameState = {
      round: 1,
      currentPlayerIndex: 0,
      players: [player],
      actionSpaces: [],
      log: [],
      roundActionOrder: [],
      gameSeed: 1,
      availableMajorImprovements: [],
      futureMeeples: [],
      pendingFutureMeeples: [],
      gameOver: false,
    } as GameState
    const space = createSpace(action)

    const engine = new Engine({
      tree: new EngineTree(new ActionNode('a', 'test-action')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    let step = engine.proceed({ state, player, space })
    while (step.type === 'ok') {
      step = engine.proceed({ state, player, space })
    }

    expect(order).toEqual(['action-hook', 'card-listener'])
  })

  it('does not let a card opt-in override an action hook veto', () => {
    registerActionHook({
      id: 'aaa-veto',
      actions: ['test-action'],
      phases: ['isDoable'],
      handler: () => ({ doable: false }),
    })
    requireActiveCardRegistry('hook-dispatch').registerListener({
      id: 'zzz-before-opt-in',
      cardIds: ['card-A'],
      actions: ['test-action'],
      phases: ['isDoable'],
      handler: () => ({ doable: true }),
    })

    const player = createPlayer()
    player.minorPlayed = ['card-A']
    const action = { ...createAction(), canBeExecutedByPlayer: () => false }
    const state = {
      round: 1, currentPlayerIndex: 0,
      players: [player], actionSpaces: [], log: [],
      roundActionOrder: [],
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [], gameOver: false,
    } as GameState
    const dispatcher = new HookDispatcher()

    const doable = dispatcher.applyIsDoable({
      state,
      player,
      space: createSpace(action),
      actionId: 'test-action',
    }, action, false)

    expect(doable).toBe(false)
  })

  it('does not let a later card opt-in override an earlier card veto', () => {
    requireActiveCardRegistry('hook-dispatch').registerListener({
      id: 'aaa-card-veto',
      cardIds: ['card-A'],
      actions: ['test-action'],
      phases: ['isDoable'],
      handler: () => ({ doable: false }),
    })
    requireActiveCardRegistry('hook-dispatch').registerListener({
      id: 'zzz-card-opt-in',
      cardIds: ['card-B'],
      actions: ['test-action'],
      phases: ['isDoable'],
      handler: () => ({ doable: true }),
    })

    const player = createPlayer()
    player.minorPlayed = ['card-A', 'card-B']
    const action = { ...createAction(), canBeExecutedByPlayer: () => false }
    const state = {
      round: 1, currentPlayerIndex: 0,
      players: [player], actionSpaces: [], log: [],
      roundActionOrder: [],
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [], gameOver: false,
    } as GameState
    const dispatcher = new HookDispatcher()

    const doable = dispatcher.applyIsDoable({
      state,
      player,
      space: createSpace(action),
      actionId: 'test-action',
    }, action, false)

    expect(doable).toBe(false)
  })

  it('does not let a flow-derived child opt-in override a child veto', () => {
    registerActionHook({
      id: 'aaa-child-veto',
      actions: ['child-action'],
      phases: ['isDoable'],
      handler: () => ({ doable: false }),
    })
    requireActiveCardRegistry('hook-dispatch').registerListener({
      id: 'zzz-child-opt-in',
      cardIds: ['card-A'],
      actions: ['child-action'],
      phases: ['isDoable'],
      handler: () => ({ doable: true }),
    })

    const player = createPlayer()
    player.minorPlayed = ['card-A']
    const childAction = {
      ...createAction(),
      id: 'child-action',
      canBeExecutedByPlayer: () => false,
    }
    const parentAction = {
      ...createAction(),
      id: 'parent-action',
      flow: { type: 'leaf' as const, actionId: 'child-action' },
      canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
    }
    const actions = new Map<string, ActionDefinition>([
      [childAction.id, childAction],
      [parentAction.id, parentAction],
    ])
    initializeFlowDerivedCanBeExecutedByPlayer(parentAction, (actionId) => actions.get(actionId))
    const state = {
      round: 1, currentPlayerIndex: 0,
      players: [player], actionSpaces: [], log: [],
      roundActionOrder: [],
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [], gameOver: false,
    } as GameState

    const doable = parentAction.canBeExecutedByPlayer.call(createSpace(parentAction), state, player)

    expect(doable).toBe(false)
  })

  it('passes skipBeforeTriggers to flow-derived child opt-ins', () => {
    requireActiveCardRegistry('hook-dispatch').registerListener({
      id: 'child-before-opt-in',
      cardIds: ['card-A'],
      actions: ['child-action'],
      phases: ['isDoable'],
      handler: (context) => {
        if (context.actionContext?.skipBeforeTriggers === true) return
        return { doable: true }
      },
    })

    const player = createPlayer()
    player.minorPlayed = ['card-A']
    const childAction = {
      ...createAction(),
      id: 'child-action',
      canBeExecutedByPlayer: () => false,
    }
    const parentAction = {
      ...createAction(),
      id: 'parent-action',
      flow: { type: 'leaf' as const, actionId: 'child-action' },
      canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
    }
    const actions = new Map<string, ActionDefinition>([
      [childAction.id, childAction],
      [parentAction.id, parentAction],
    ])
    initializeFlowDerivedCanBeExecutedByPlayer(parentAction, (actionId) => actions.get(actionId))
    const state = {
      round: 1, currentPlayerIndex: 0,
      players: [player], actionSpaces: [], log: [],
      roundActionOrder: [],
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [], gameOver: false,
    } as GameState

    expect(parentAction.canBeExecutedByPlayer.call(createSpace(parentAction), state, player)).toBe(true)
    expect(parentAction.canBeExecutedByPlayer.call(
      createSpace(parentAction),
      state,
      player,
      { actionContext: { skipBeforeTriggers: true } } as CanBeExecutedByPlayerContext,
    )).toBe(false)
  })
})

describe('Card listener scope filtering', () => {
  beforeEach(() => {
    clearActionHooks()
    setActiveCardRegistry(new CardRegistry())
  })

  it('scope player: triggers only when active player has card', () => {
    let triggered = false
    const p1 = createPlayer('p1', 'P1')
    p1.minorPlayed = ['scope-card']
    const p2 = createPlayer('p2', 'P2')

    requireActiveCardRegistry('hook-dispatch').registerListener({
      id: 'scope-player-test',
      cardIds: ['scope-card'],
      actions: ['test-action'],
      phases: ['after'],
      scope: 'player',
      handler: () => {
        triggered = true
        return {}
      },
    })

    const action = createAction()
    const registry = new ActionRegistry()
    registry.register(action)
    const state = {
      round: 1, currentPlayerIndex: 0,
      players: [p1, p2], actionSpaces: [], log: [],
      roundActionOrder: [],
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [], gameOver: false,
    } as GameState
    const space = createSpace(action)

    const engine1 = new Engine({
      tree: new EngineTree(new ActionNode('a', 'test-action')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    let step1 = engine1.proceed({ state, player: p1, space })
    while (step1.type === 'ok') {
      step1 = engine1.proceed({ state, player: p1, space })
    }
    expect(triggered).toBe(true)

    triggered = false
    const engine2 = new Engine({
      tree: new EngineTree(new ActionNode('b', 'test-action')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    let step2 = engine2.proceed({ state, player: p2, space })
    while (step2.type === 'ok') {
      step2 = engine2.proceed({ state, player: p2, space })
    }
    expect(triggered).toBe(false)
  })

  it('scope opponent: triggers only when opponent has card', () => {
    let triggered = false
    const p1 = createPlayer('p1', 'P1')
    const p2 = createPlayer('p2', 'P2')
    p2.minorPlayed = ['opp-card']

    requireActiveCardRegistry('hook-dispatch').registerListener({
      id: 'scope-opponent-test',
      cardIds: ['opp-card'],
      actions: ['test-action'],
      phases: ['after'],
      scope: 'opponent',
      handler: () => {
        triggered = true
        return {}
      },
    })

    const action = createAction()
    const registry = new ActionRegistry()
    registry.register(action)
    const state = {
      round: 1, currentPlayerIndex: 0,
      players: [p1, p2], actionSpaces: [], log: [],
      roundActionOrder: [],
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [], gameOver: false,
    } as GameState
    const space = createSpace(action)

    const engine = new Engine({
      tree: new EngineTree(new ActionNode('a', 'test-action')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    drainEngine(engine, state, p1, space)
    expect(triggered).toBe(true)

    triggered = false
    setActiveCardRegistry(new CardRegistry())
    requireActiveCardRegistry('hook-dispatch').registerListener({
      id: 'scope-opponent-test2',
      cardIds: ['opp-card'],
      actions: ['test-action'],
      phases: ['after'],
      scope: 'opponent',
      handler: () => {
        triggered = true
        return {}
      },
    })
    const engine2 = new Engine({
      tree: new EngineTree(new ActionNode('b', 'test-action')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    drainEngine(engine2, state, p2, space)
    expect(triggered).toBe(false)
  })

  it('scope any: triggers regardless of who holds the card', () => {
    let count = 0
    const p1 = createPlayer('p1', 'P1')
    const p2 = createPlayer('p2', 'P2')
    p1.minorPlayed = ['any-card']

    requireActiveCardRegistry('hook-dispatch').registerListener({
      id: 'scope-any-test',
      cardIds: ['any-card'],
      actions: ['test-action'],
      phases: ['after'],
      scope: 'any',
      handler: () => {
        count++
        return {}
      },
    })

    const action = createAction()
    const registry = new ActionRegistry()
    registry.register(action)
    const state = {
      round: 1, currentPlayerIndex: 0,
      players: [p1, p2], actionSpaces: [], log: [],
      roundActionOrder: [],
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [], gameOver: false,
    } as GameState
    const space = createSpace(action)

    const engine1 = new Engine({
      tree: new EngineTree(new ActionNode('a', 'test-action')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    let step1 = engine1.proceed({ state, player: p1, space })
    while (step1.type === 'ok') {
      step1 = engine1.proceed({ state, player: p1, space })
    }
    expect(count).toBe(1)

    const engine2 = new Engine({
      tree: new EngineTree(new ActionNode('b', 'test-action')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    let step2 = engine2.proceed({ state, player: p2, space })
    while (step2.type === 'ok') {
      step2 = engine2.proceed({ state, player: p2, space })
    }
    expect(count).toBe(2)
  })
})

describe('Multiple hooks overriding doable', () => {
  beforeEach(() => {
    clearActionHooks()
    setActiveCardRegistry(new CardRegistry())
  })

  it('does not let a later hook opt-in override an earlier hook veto', () => {
    registerActionHook({
      id: 'block-it',
      actions: ['test-action'],
      phases: ['isDoable'],
      order: 1,
      handler: () => ({ doable: false }),
    })
    registerActionHook({
      id: 'allow-it',
      actions: ['test-action'],
      phases: ['isDoable'],
      order: 2,
      handler: () => ({ doable: true }),
    })

    const action = createAction()
    const registry = new ActionRegistry()
    registry.register(action)
    const player = createPlayer()
    const state = {
      round: 1, currentPlayerIndex: 0,
      players: [player], actionSpaces: [], log: [],
      roundActionOrder: [],
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [], gameOver: false,
    } as GameState
    const space = createSpace(action)

    const engine = new Engine({
      tree: new EngineTree(new ActionNode('a', 'test-action')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const result = engine.proceed({ state, player, space })
    expect(result.type).not.toBe('ok')
  })
})

describe('Cost preview doable', () => {
  beforeEach(() => {
    clearActionHooks()
    setActiveCardRegistry(new CardRegistry())
  })

  it('construct can become doable after computeCosts discount', () => {
    registerActionHook({
      id: 'construct-discount',
      actions: ['construct'],
      phases: ['computeCosts'],
      handler: () => ({ costs: { stone: -2 } }),
    })

    const player = createPlayer()
    player.houseType = 'stone'
    player.resources.stone = 3
    player.resources.reed = 2
    const state = {
      round: 1, currentPlayerIndex: 0,
      players: [player], actionSpaces: [], log: [],
      roundActionOrder: [],
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [], gameOver: false,
    } as GameState
    const dispatcher = new HookDispatcher()

    const doable = dispatcher.applyIsDoable({
      state,
      player,
      space: createSpace({ ...createAction(), id: 'construct' }),
      actionId: 'construct',
    }, constructAction, false)

    expect(doable).toBe(true)
  })

  it('plow becomes not doable when computeCosts adds a food surcharge', () => {
    registerActionHook({
      id: 'plow-food-cost',
      actions: ['plow'],
      phases: ['computeCosts'],
      handler: () => ({ costs: { food: 1 } }),
    })

    const player = createPlayer()
    player.resources.food = 0
    const state = {
      round: 1, currentPlayerIndex: 0,
      players: [player], actionSpaces: [], log: [],
      roundActionOrder: [],
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [], gameOver: false,
    } as GameState
    const dispatcher = new HookDispatcher()

    const doable = dispatcher.applyIsDoable({
      state,
      player,
      space: createSpace({ ...createAction(), id: 'plow' }),
      actionId: 'plow',
    }, plowAction, true)

    expect(doable).toBe(false)
  })

  it('stables still respects structural limits even with discounts', () => {
    registerActionHook({
      id: 'stable-discount',
      actions: ['stables'],
      phases: ['computeCosts'],
      handler: () => ({ costs: { wood: -1 } }),
    })

    const player = createPlayer()
    player.resources.wood = 1
    player.stableTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }]
    const state = {
      round: 1, currentPlayerIndex: 0,
      players: [player], actionSpaces: [], log: [],
      roundActionOrder: [],
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [], gameOver: false,
    } as GameState
    const dispatcher = new HookDispatcher()

    const doable = dispatcher.applyIsDoable({
      state,
      player,
      space: createSpace({ ...createAction(), id: 'stables' }),
      actionId: 'stables',
    }, stablesAction, false)

    expect(doable).toBe(false)
  })
})
